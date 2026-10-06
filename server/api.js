'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const T = require('./time');
const archive = require('./archive');
const ingest = require('./ingest');
const D = require('./daily');
const S = require('./scores');
const settings = require('./settings');
const { buildCsv } = require('./csv');
const { correlations, tagEffects } = require('./analysis');
const { buildReport } = require('./report');

const DATA_DIR = process.env.DATA_DIR || '/data';
const APK_FILE = path.join(DATA_DIR, 'app', 'hc-bridge.apk');
const PH_APK_FILE = path.join(DATA_DIR, 'app', 'ph-app.apk');

function apkInfo(file) {
  try {
    const st = fs.statSync(file);
    return { size: st.size, mtime: st.mtimeMs };
  } catch {
    return null; // app not built
  }
}
const router = express.Router();

// edit configuration per sample type: label, unit, plausibility range (warning only)
const KINDS = {
  ph: { label: 'pH-Wert', unit: '', digits: 1, warn: [4, 9] },
  hr: { label: 'Herzfrequenz', unit: 'bpm', digits: 0, warn: [30, 220] },
  spo2: { label: 'SpO₂', unit: '%', digits: 0, warn: [70, 100] },
  weight: { label: 'Gewicht', unit: 'kg', digits: 1, warn: [30, 250] },
  resting_hr: { label: 'Ruhepuls', unit: 'bpm', digits: 0, warn: [30, 120] },
  hrv: { label: 'HRV', unit: 'ms', digits: 0, warn: [5, 250] },
  bp: { label: 'Blutdruck', unit: 'mmHg', digits: 0, warn: [70, 200], warn2: [40, 130], two: true },
  temp: { label: 'Körpertemperatur', unit: '°C', digits: 1, warn: [34, 42] },
  resp_rate: { label: 'Atemfrequenz', unit: '/min', digits: 0, warn: [6, 40] },
  body_fat: { label: 'Körperfett', unit: '%', digits: 1, warn: [3, 60] },
  vo2max: { label: 'VO₂max', unit: '', digits: 1, warn: [10, 90] },
  glucose: { label: 'Blutzucker', unit: 'mg/dl', digits: 0, warn: [40, 400] },
};
const DAY_KINDS = { steps: { label: 'Schritte', unit: '', digits: 0, warn: [0, 60000] } };

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function rangeQuery(req, defDays = 7) {
  const today = T.today();
  let to = T.isDayKey(req.query.to) ? req.query.to : today;
  let from = T.isDayKey(req.query.from) ? req.query.from : T.addDays(to, -(defDays - 1));
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function device(req) {
  const ua = req.get('user-agent') || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'unbekannt';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  return `${os}${br ? ' / ' + br : ''} (${ip})`.slice(0, 255);
}

async function logEdit(req, kind, ref, action, field, oldV, newV) {
  await db.query(
    'INSERT INTO edit_log (at, kind, ref, action, field, old_value, new_value, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [Date.now(), kind, String(ref), action, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV), device(req)]
  );
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// ---------- meta / overview ----------

router.get('/meta', wrap(async (req, res) => {
  const [range, types, profile, sources] = await Promise.all([D.dataRange(), D.availableTypes(), settings.getProfile(), settings.getSourceSettings()]);
  const unknown = await db.query('SELECT record_type, COUNT(*) AS n FROM unknown_records GROUP BY record_type');
  res.json({
    tz: T.TZ,
    today: T.today(),
    range,
    types,
    profile,
    sources,
    lastBySource: archive.lastBySource(),
    ingest: ingest.status,
    unknownTypes: unknown.map((r) => ({ type: r.record_type, count: Number(r.n) })),
    kinds: KINDS,
    dayKinds: DAY_KINDS,
    apk: apkInfo(APK_FILE),
    apkPh: apkInfo(PH_APK_FILE),
  });
}));

router.get('/daily', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 30);
  res.json({ from, to, days: await D.computeDaily(from, to) });
}));

async function recentStepsAvg() {
  const to = T.today();
  const days = await D.computeDaily(T.addDays(to, -7), to);
  const rec = days.filter((d) => d.steps > 0);
  return rec.length ? Math.round(rec.reduce((a, d) => a + d.steps, 0) / rec.length) : 0;
}

// scores + stats for a range (used by every view)
async function summary(from, to) {
  const profile = await settings.getProfile();
  const derived = settings.derive(profile, await recentStepsAvg());
  const days = await D.computeDaily(from, to);
  const spo2 = await D.loadSamples(['spo2'], T.dayStart(from), T.dayStart(T.addDays(to, 1)));
  const ph = await D.loadSamples(['ph'], T.dayStart(from), T.dayStart(T.addDays(to, 1)));
  const out = {
    from,
    to,
    sleep: S.sleepSummary(days, profile),
    resting: S.restingSummary(days, profile),
    steps: S.stepsSummary(days, derived.stepGoal),
    spo2: S.spo2Summary(spo2),
    ph: S.phSummary(ph, derived.phTarget),
  };
  out.overall = S.overall([out.sleep, out.resting, out.steps, out.spo2, out.ph]);
  return { summary: out, days, derived, profile };
}

router.get('/summary', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 7);
  const { summary: s, days, derived } = await summary(from, to);
  res.json({ ...s, days, derived });
}));

// "Heute": scores over the last 7 days (pH: 30), latest values, 30-day trends
router.get('/today', wrap(async (req, res) => {
  const today = T.today();
  const from30 = T.addDays(today, -29);
  const { summary: s7, derived, profile } = await summary(T.addDays(today, -6), today);
  const days = await D.computeDaily(from30, today);
  const ph = await D.loadSamples(['ph'], T.dayStart(from30), T.dayStart(T.addDays(today, 1)));
  s7.ph = S.phSummary(ph, derived.phTarget);
  s7.overall = S.overall([s7.sleep, s7.resting, s7.steps, s7.spo2, s7.ph]);
  const latest = {};
  for (const type of ['hr', 'spo2', 'ph', 'weight', 'hrv', 'bp', 'temp']) {
    const r = await db.query(
      `SELECT * FROM samples WHERE type = ? AND deleted = 0 ORDER BY COALESCE(edit_time, time) DESC LIMIT 1`, [type]
    );
    if (r.length) latest[type] = D.effSample(r[0]);
  }
  const night = [...days].reverse().find((d) => d.sleep);
  res.json({
    today,
    summary: s7,
    derived,
    profile,
    latest,
    lastNight: night ? { day: night.day, ...night.sleep, score: S.sleepScore(night.sleep.stages, night.sleep.mainDurationMs, profile) } : null,
    days,
    lastBySource: archive.lastBySource(),
  });
}));

// raw points of one sample type, bucketed (avg/min/max) to at most `max` points
router.get('/series/:type', wrap(async (req, res) => {
  const type = req.params.type;
  const now = Date.now();
  const to = parseInt(req.query.to, 10) || now;
  const from = parseInt(req.query.from, 10) || to - T.DAY;
  const max = Math.min(5000, Math.max(10, parseInt(req.query.max, 10) || 800));
  const samples = await D.loadSamples([type], from, to);
  let points;
  if (samples.length <= max) {
    points = samples.map((s) => ({ t: s.time, v: s.value, v2: s.value2 ?? undefined }));
  } else {
    const bucket = (to - from) / max;
    const m = new Map();
    for (const s of samples) {
      const b = Math.floor((s.time - from) / bucket);
      if (!m.has(b)) m.set(b, { sum: 0, n: 0, min: Infinity, max: -Infinity });
      const x = m.get(b);
      x.sum += s.value;
      x.n++;
      x.min = Math.min(x.min, s.value);
      x.max = Math.max(x.max, s.value);
    }
    points = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([b, x]) => ({
      t: Math.round(from + (b + 0.5) * bucket), v: x.sum / x.n, min: x.min, max: x.max,
    }));
  }
  res.json({ type, from, to, count: samples.length, bucketed: samples.length > max, points });
}));

router.get('/hr-zones', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 7);
  const profile = await settings.getProfile();
  const derived = settings.derive(profile, 0);
  const samples = await D.loadSamples(['hr'], T.dayStart(from), T.dayStart(T.addDays(to, 1)));
  const zones = S.hrZones(derived.maxHr);
  // median sample interval as time weight
  let interval = 300000;
  if (samples.length > 1) {
    const iv = [];
    for (let i = 1; i < samples.length; i++) iv.push(samples[i].time - samples[i - 1].time);
    iv.sort((a, b) => a - b);
    interval = Math.min(600000, Math.max(60000, iv[Math.floor(iv.length / 2)] || 300000));
  }
  const ms = zones.map(() => 0);
  for (const s of samples) {
    const i = zones.findIndex((z) => s.value >= z.min && s.value < z.max);
    ms[i === -1 ? zones.length - 1 : i] += interval;
  }
  const total = ms.reduce((a, b) => a + b, 0);
  res.json({ from, to, maxHr: derived.maxHr, zones: zones.map((z, i) => ({ ...z, ms: ms[i], pct: total ? Math.round((ms[i] / total) * 100) : 0 })) });
}));

router.get('/sleep', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 14);
  const profile = await settings.getProfile();
  const sessions = await D.loadSleep(T.dayStart(from), T.dayStart(T.addDays(to, 1)));
  res.json({
    from,
    to,
    sessions: sessions.map((s) => ({
      ...s,
      day: T.dayKey(s.end),
      score: S.sleepScore(D.stageTotals(s.stages), s.durationMs, profile),
    })),
  });
}));

router.get('/exercise', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 30);
  const rows = await D.loadExercise(T.dayStart(from), T.dayStart(T.addDays(to, 1)));
  res.json({ from, to, sessions: rows.map((r) => ({ id: r.id, type: r.exercise_type, title: r.title, notes: r.notes, start: r.start_time, end: r.end_time, source: r.source })) });
}));

router.get('/analysis', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 90);
  const days = await D.computeDaily(from, to);
  res.json({ from, to, correlations: correlations(days), tags: tagEffects(days) });
}));

// ---------- journal (notes + tags) ----------

router.get('/tags', wrap(async (req, res) => {
  const rows = await db.query('SELECT t.*, (SELECT COUNT(*) FROM day_tags dt WHERE dt.tag_id = t.id) AS uses FROM tags t ORDER BY sort, name');
  res.json(rows.map((r) => ({ ...r, uses: Number(r.uses) })));
}));

router.post('/tags', wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 64);
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const color = /^#[0-9a-f]{6}$/i.test(req.body.color || '') ? req.body.color : '#94a3b8';
  const max = await db.query('SELECT COALESCE(MAX(sort), 0) AS m FROM tags');
  try {
    const r = await db.query('INSERT INTO tags (name, color, sort) VALUES (?, ?, ?)', [name, color, max[0].m + 1]);
    res.json({ id: r.insertId, name, color });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tag existiert bereits' });
    throw e;
  }
}));

router.patch('/tags/:id', wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const vals = [];
  if (typeof b.name === 'string' && b.name.trim()) { sets.push('name = ?'); vals.push(b.name.trim().slice(0, 64)); }
  if (/^#[0-9a-f]{6}$/i.test(b.color || '')) { sets.push('color = ?'); vals.push(b.color); }
  if (Number.isInteger(b.sort)) { sets.push('sort = ?'); vals.push(b.sort); }
  if (sets.length) await db.query(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/tags/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM day_tags WHERE tag_id = ?', [req.params.id]);
  await db.query('DELETE FROM tags WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

router.get('/journal', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 31);
  const notes = await db.query('SELECT day, note FROM day_notes WHERE day >= ? AND day <= ?', [from, to]);
  const tags = await db.query('SELECT day, tag_id FROM day_tags WHERE day >= ? AND day <= ?', [from, to]);
  const m = new Map();
  for (const n of notes) m.set(n.day, { day: n.day, note: n.note, tagIds: [] });
  for (const t of tags) {
    if (!m.has(t.day)) m.set(t.day, { day: t.day, note: null, tagIds: [] });
    m.get(t.day).tagIds.push(t.tag_id);
  }
  res.json({ from, to, entries: [...m.values()].sort((a, b) => a.day.localeCompare(b.day)) });
}));

router.put('/journal/:day', wrap(async (req, res) => {
  const day = req.params.day;
  if (!T.isDayKey(day)) return res.status(400).json({ error: 'Ungültiges Datum' });
  const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 5000) : null;
  const tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds.map(Number).filter(Number.isInteger) : null;
  await db.tx(async (q) => {
    if (note !== null) {
      if (note.trim()) await q('INSERT INTO day_notes (day, note, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = VALUES(updated_at)', [day, note, Date.now()]);
      else await q('DELETE FROM day_notes WHERE day = ?', [day]);
    }
    if (tagIds !== null) {
      await q('DELETE FROM day_tags WHERE day = ?', [day]);
      if (tagIds.length) await q('INSERT IGNORE INTO day_tags (day, tag_id) VALUES ?', [tagIds.map((id) => [day, id])]);
    }
  });
  res.json({ ok: true });
}));

// ---------- profile / settings ----------

router.get('/profile', wrap(async (req, res) => {
  const profile = await settings.getProfile();
  res.json({ profile, derived: settings.derive(profile, await recentStepsAvg()), sources: await settings.getSourceSettings() });
}));

router.put('/profile', wrap(async (req, res) => {
  const b = req.body || {};
  const int = (v, lo, hi) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const ph = (v) => {
    const n = parseNum(v);
    return Number.isFinite(n) && n >= 0 && n <= 14 ? n : null;
  };
  let phTargetMin = ph(b.phTargetMin);
  let phTargetMax = ph(b.phTargetMax);
  if (phTargetMin == null || phTargetMax == null) phTargetMin = phTargetMax = null;
  else if (phTargetMin > phTargetMax) [phTargetMin, phTargetMax] = [phTargetMax, phTargetMin];
  const trainingGoal = settings.TRAINING_GOALS[b.trainingGoal] ? b.trainingGoal : 'aus';
  const old = await settings.getProfile();
  const profile = {
    name: typeof b.name === 'string' ? b.name.trim().slice(0, 100) : null,
    birthDate: T.isDayKey(b.birthDate) ? b.birthDate : null,
    sex: b.sex === 'male' || b.sex === 'female' ? b.sex : null,
    heightCm: int(b.heightCm, 100, 250),
    trainingGoal,
    stepGoal: int(b.stepGoal, 1000, 50000) || 10000,
    phTargetMin,
    phTargetMax,
    updatedAt: new Date().toISOString(),
  };
  await settings.saveProfile(profile);
  // a changed weight becomes a new measurement in the weight history
  const w = parseNum(b.weightKg);
  if (Number.isFinite(w) && w >= 20 && w <= 400 && Math.abs(w - (old.weightKg || 0)) >= 0.05) {
    const t = Date.now();
    await db.query("INSERT INTO samples (type, time, value, source, received_at, manual) VALUES ('weight', ?, ?, 'profil', ?, 1)", [t, w, t]);
    await logEdit(req, 'weight', 'profil', 'nachgetragen', 'Wert', null, w);
  }
  if (b.sources && Array.isArray(b.sources.priority)) {
    await db.setSetting('sources', {
      priority: b.sources.priority.map(String).filter(Boolean).slice(0, 20),
      mode: b.sources.mode === 'max' ? 'max' : 'priority',
    });
  }
  const p = await settings.getProfile();
  res.json({ profile: p, derived: settings.derive(p, await recentStepsAvg()), sources: await settings.getSourceSettings() });
}));

// sources seen in the interval data (for the priority editor)
router.get('/sources', wrap(async (req, res) => {
  const rows = await db.query('SELECT source, type, COUNT(*) AS n, MAX(start_time) AS last FROM interval_records GROUP BY source, type');
  const s = await db.query('SELECT source, type, COUNT(*) AS n, MAX(time) AS last FROM samples GROUP BY source, type');
  res.json({ intervals: rows.map((r) => ({ ...r, n: Number(r.n), last: Number(r.last) })), samples: s.map((r) => ({ ...r, n: Number(r.n), last: Number(r.last) })) });
}));

// ---------- editing ----------

function sampleOut(r) {
  const s = D.effSample(r);
  return { ...s, day: T.dayKey(s.time) };
}

router.get('/edit/samples/:type', wrap(async (req, res) => {
  const type = req.params.type;
  if (!KINDS[type]) return res.status(404).json({ error: 'Unbekannte Messart' });
  const { from, to } = rangeQuery(req, 30);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(500, Math.max(10, parseInt(req.query.size, 10) || 50));
  const filter = req.query.filter || 'all';
  let where = 'type = ? AND COALESCE(edit_time, time) >= ? AND COALESCE(edit_time, time) < ?';
  if (filter === 'changed') where += ' AND (edit_time IS NOT NULL OR edit_value IS NOT NULL OR edit_value2 IS NOT NULL OR deleted = 1)';
  else if (filter === 'manual') where += ' AND manual = 1';
  else if (filter === 'deleted') where += ' AND deleted = 1';
  const params = [type, T.dayStart(from), T.dayStart(T.addDays(to, 1))];
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM samples WHERE ${where}`, params);
  const rows = await db.query(`SELECT * FROM samples WHERE ${where} ORDER BY COALESCE(edit_time, time) DESC LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]);
  res.json({ type, from, to, page, size, total: Number(n), items: rows.map(sampleOut) });
}));

router.post('/edit/samples', wrap(async (req, res) => {
  const b = req.body || {};
  const kind = KINDS[b.type];
  if (!kind) return res.status(400).json({ error: 'Unbekannte Messart' });
  const value = parseNum(b.value);
  const value2 = kind.two ? parseNum(b.value2) : null;
  let time = T.parseLocal(b.time);
  if (!Number.isFinite(value) || value === null) return res.status(400).json({ error: 'Wert fehlt oder ist keine Zahl' });
  if (Number.isNaN(value2)) return res.status(400).json({ error: 'Zweiter Wert ist keine Zahl' });
  if (!Number.isFinite(time)) return res.status(400).json({ error: 'Ungültiger Zeitpunkt' });
  // unique (type, time): shift by milliseconds if the slot is taken
  for (let i = 0; i < 1000; i++, time++) {
    try {
      const r = await db.query('INSERT INTO samples (type, time, value, value2, source, received_at, manual) VALUES (?, ?, ?, ?, ?, ?, 1)', [b.type, time, value, value2, 'manuell', Date.now()]);
      await logEdit(req, b.type, r.insertId, 'nachgetragen', 'Wert', null, value2 != null ? `${value}/${value2}` : value);
      return res.json({ ok: true, id: r.insertId });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
    }
  }
  res.status(409).json({ error: 'Zeitpunkt belegt' });
}));

router.patch('/edit/samples/:id', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM samples WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const r = rows[0];
  const before = D.effSample(r);
  const b = req.body || {};
  const sets = { edit_value: r.edit_value, edit_value2: r.edit_value2, edit_time: r.edit_time };
  if (b.value !== undefined) {
    const v = parseNum(b.value);
    if (!Number.isFinite(v)) return res.status(400).json({ error: 'Wert ist keine Zahl' });
    sets.edit_value = v === r.value ? null : v;
  }
  if (b.value2 !== undefined) {
    const v = parseNum(b.value2);
    if (Number.isNaN(v)) return res.status(400).json({ error: 'Zweiter Wert ist keine Zahl' });
    sets.edit_value2 = v === r.value2 ? null : v;
  }
  if (b.time !== undefined) {
    const t = T.parseLocal(b.time);
    if (!Number.isFinite(t)) return res.status(400).json({ error: 'Ungültiger Zeitpunkt' });
    // keep seconds of the original when only the minute matches
    sets.edit_time = Math.floor(t / 60000) === Math.floor(r.time / 60000) ? null : t;
  }
  if (r.manual) {
    // manual entries are edited in place (there is no original to keep)
    await db.query('UPDATE samples SET value = ?, value2 = ?, time = ?, edit_value = NULL, edit_value2 = NULL, edit_time = NULL, edited_at = ? WHERE id = ?',
      [sets.edit_value ?? r.value, sets.edit_value2 ?? r.value2, sets.edit_time ?? r.time, Date.now(), r.id]);
  } else {
    await db.query('UPDATE samples SET edit_value = ?, edit_value2 = ?, edit_time = ?, edited_at = ? WHERE id = ?', [sets.edit_value, sets.edit_value2, sets.edit_time, Date.now(), r.id]);
  }
  const after = D.effSample((await db.query('SELECT * FROM samples WHERE id = ?', [r.id]))[0]);
  if (before.value !== after.value) await logEdit(req, r.type, r.id, 'geändert', 'Wert', before.value, after.value);
  if (before.value2 !== after.value2) await logEdit(req, r.type, r.id, 'geändert', 'Wert 2', before.value2, after.value2);
  if (before.time !== after.time) await logEdit(req, r.type, r.id, 'geändert', 'Zeit', T.localIso(before.time), T.localIso(after.time));
  res.json({ ok: true, item: { ...after, day: T.dayKey(after.time) } });
}));

router.delete('/edit/samples/:id', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM samples WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  await db.query('UPDATE samples SET deleted = 1, edited_at = ? WHERE id = ?', [Date.now(), req.params.id]);
  const s = D.effSample(rows[0]);
  await logEdit(req, s.type, s.id, 'gelöscht', 'Wert', s.value, null);
  res.json({ ok: true });
}));

router.post('/edit/samples/:id/reset', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM samples WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const before = D.effSample(rows[0]);
  await db.query('UPDATE samples SET deleted = 0, edit_value = NULL, edit_value2 = NULL, edit_time = NULL, edited_at = NULL WHERE id = ?', [req.params.id]);
  await logEdit(req, before.type, before.id, before.deleted ? 'wiederhergestellt' : 'zurückgesetzt', 'Wert', before.value, rows[0].value);
  res.json({ ok: true });
}));

// day totals (steps)
router.get('/edit/days/:type', wrap(async (req, res) => {
  const type = req.params.type;
  if (!DAY_KINDS[type]) return res.status(404).json({ error: 'Unbekannte Messart' });
  const { from, to } = rangeQuery(req, 30);
  const days = await D.computeDaily(from, to);
  const ov = await db.query('SELECT * FROM day_overrides WHERE type = ? AND day >= ? AND day <= ?', [type, from, to]);
  const om = new Map(ov.map((o) => [o.day, o]));
  let items = days.map((d) => {
    const o = om.get(d.day);
    return {
      day: d.day,
      value: d.steps,
      original: o ? d.stepsOriginal : d.steps,
      source: d.stepsSource,
      edited: !!o,
      manual: !!o && d.stepsOriginal == null,
      editedAt: o ? o.edited_at : null,
    };
  }).reverse();
  if (req.query.filter === 'changed') items = items.filter((x) => x.edited);
  if (req.query.filter === 'manual') items = items.filter((x) => x.manual);
  res.json({ type, from, to, items, total: items.length });
}));

router.put('/edit/days/:type/:day', wrap(async (req, res) => {
  const { type, day } = req.params;
  if (!DAY_KINDS[type] || !T.isDayKey(day)) return res.status(400).json({ error: 'Ungültig' });
  const v = parseNum((req.body || {}).value);
  if (!Number.isFinite(v)) return res.status(400).json({ error: 'Wert ist keine Zahl' });
  const [d] = await D.computeDaily(day, day);
  const existing = await db.query('SELECT * FROM day_overrides WHERE type = ? AND day = ?', [type, day]);
  const original = existing.length ? existing[0].original_value : d.steps;
  if (original != null && v === original) {
    await db.query('DELETE FROM day_overrides WHERE type = ? AND day = ?', [type, day]);
  } else {
    await db.query('INSERT INTO day_overrides (type, day, value, original_value, edited_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), edited_at = VALUES(edited_at)', [type, day, v, original, Date.now()]);
  }
  await logEdit(req, type, day, original == null && !existing.length ? 'nachgetragen' : 'geändert', 'Tagessumme', d.steps, v);
  res.json({ ok: true });
}));

router.delete('/edit/days/:type/:day', wrap(async (req, res) => {
  const { type, day } = req.params;
  const [d] = await D.computeDaily(day, day);
  await db.query('DELETE FROM day_overrides WHERE type = ? AND day = ?', [type, day]);
  await logEdit(req, type, day, 'zurückgesetzt', 'Tagessumme', d.steps, d.stepsOriginal);
  res.json({ ok: true });
}));

// sleep sessions
router.get('/edit/sleep', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 60);
  let items = await D.loadSleep(T.dayStart(from), T.dayStart(T.addDays(to, 1)), { includeDeleted: true });
  if (req.query.filter === 'changed') items = items.filter((s) => s.edited || s.deleted);
  if (req.query.filter === 'manual') items = items.filter((s) => s.manual);
  if (req.query.filter === 'deleted') items = items.filter((s) => s.deleted);
  res.json({ from, to, total: items.length, items: items.reverse().map((s) => ({ ...s, day: T.dayKey(s.end) })) });
}));

router.post('/edit/sleep', wrap(async (req, res) => {
  const start = T.parseLocal((req.body || {}).start);
  const end = T.parseLocal((req.body || {}).end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return res.status(400).json({ error: 'Ende muss nach dem Beginn liegen' });
  const r = await db.query("INSERT INTO sleep_sessions (raw_start, raw_end, stages, source, hc_ids, received_at, manual) VALUES (?, ?, '[]', 'manuell', '[]', ?, 1)", [start, end, Date.now()]);
  await logEdit(req, 'sleep', r.insertId, 'nachgetragen', 'Zeitraum', null, `${T.localIso(start)} – ${T.localIso(end)}`);
  res.json({ ok: true, id: r.insertId });
}));

router.patch('/edit/sleep/:id', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM sleep_sessions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const r = rows[0];
  const before = D.effSleep(r);
  const start = req.body.start !== undefined ? T.parseLocal(req.body.start) : before.start;
  const end = req.body.end !== undefined ? T.parseLocal(req.body.end) : before.end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return res.status(400).json({ error: 'Ende muss nach dem Beginn liegen' });
  if (r.manual) {
    await db.query('UPDATE sleep_sessions SET raw_start = ?, raw_end = ?, edited_at = ? WHERE id = ?', [start, end, Date.now(), r.id]);
  } else {
    const sameMin = (a, b) => Math.floor(a / 60000) === Math.floor(b / 60000);
    await db.query('UPDATE sleep_sessions SET edit_start = ?, edit_end = ?, edited_at = ? WHERE id = ?', [
      sameMin(start, r.raw_start) ? null : start, sameMin(end, r.raw_end) ? null : end, Date.now(), r.id]);
  }
  await logEdit(req, 'sleep', r.id, 'geändert', 'Zeitraum', `${T.localIso(before.start)} – ${T.localIso(before.end)}`, `${T.localIso(start)} – ${T.localIso(end)}`);
  res.json({ ok: true });
}));

router.delete('/edit/sleep/:id', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM sleep_sessions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const s = D.effSleep(rows[0]);
  await db.query('UPDATE sleep_sessions SET deleted = 1, edited_at = ? WHERE id = ?', [Date.now(), s.id]);
  await logEdit(req, 'sleep', s.id, 'gelöscht', 'Zeitraum', `${T.localIso(s.start)} – ${T.localIso(s.end)}`, null);
  res.json({ ok: true });
}));

router.post('/edit/sleep/:id/reset', wrap(async (req, res) => {
  const rows = await db.query('SELECT * FROM sleep_sessions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const s = D.effSleep(rows[0]);
  await db.query('UPDATE sleep_sessions SET deleted = 0, edit_start = NULL, edit_end = NULL, edited_at = NULL WHERE id = ?', [s.id]);
  await logEdit(req, 'sleep', s.id, s.deleted ? 'wiederhergestellt' : 'zurückgesetzt', 'Zeitraum', `${T.localIso(s.start)} – ${T.localIso(s.end)}`, `${T.localIso(rows[0].raw_start)} – ${T.localIso(rows[0].raw_end)}`);
  res.json({ ok: true });
}));

router.get('/edit/log', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(200, Math.max(10, parseInt(req.query.size, 10) || 50));
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM edit_log');
  const rows = await db.query('SELECT * FROM edit_log ORDER BY at DESC, id DESC LIMIT ? OFFSET ?', [size, (page - 1) * size]);
  res.json({ page, size, total: Number(n), items: rows.map((r) => ({ ...r, at: Number(r.at) })) });
}));

// ---------- raw archive ----------

router.get('/raw/months', (req, res) => {
  res.json(archive.listMonths().reverse().map((m) => {
    const e = archive.entries(m);
    let size = 0;
    try {
      size = fs.statSync(archive.gzFile(m)).size;
    } catch {
      // empty
    }
    return { month: m, count: e.length, size, bytes: e.reduce((a, x) => a + (x.bytes || 0), 0) };
  }));
});

router.get('/raw', wrap(async (req, res) => {
  const months = archive.listMonths();
  const month = months.includes(req.query.month) ? req.query.month : months[months.length - 1];
  if (!month) return res.json({ month: null, total: 0, items: [] });
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(200, Math.max(10, parseInt(req.query.size, 10) || 50));
  const q = String(req.query.q || '').toLowerCase();
  const source = req.query.source || '';
  let list = archive.entries(month).map((e, i) => ({ e, seq: i + 1 })).reverse();
  if (source) list = list.filter(({ e }) => e.source === source);
  if (q) {
    // metadata first (fast), full text in the payload as fallback
    const out = [];
    for (const it of list) {
      const meta = `${it.e.summary} ${it.e.id} ${it.e.source}`.toLowerCase();
      if (meta.includes(q)) out.push(it);
      else if (req.query.full === '1') {
        const rec = await archive.readEntry(month, it.e);
        if (JSON.stringify(rec.payload).toLowerCase().includes(q)) out.push(it);
      }
    }
    list = out;
  }
  res.json({
    month,
    page,
    size,
    total: list.length,
    items: list.slice((page - 1) * size, page * size).map(({ e, seq }) => ({ id: e.id, seq, receivedAt: e.receivedAt, source: e.source, summary: e.summary, bytes: e.bytes })),
  });
}));

router.get('/raw/:month/download', (req, res) => {
  if (!archive.listMonths().includes(req.params.month)) return res.status(404).end();
  res.download(archive.gzFile(req.params.month), `rohdaten-${req.params.month}.jsonl.gz`);
});

router.get('/raw/:month/:id', wrap(async (req, res) => {
  const e = archive.entries(req.params.month).find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ entry: e, record: await archive.readEntry(req.params.month, e) });
}));

// ---------- admin ----------

router.post('/admin/rebuild', wrap(async (req, res) => {
  await ingest.rebuildFromArchive();
  res.json({ ok: true });
}));

router.delete('/data', wrap(async (req, res) => {
  if ((req.body || {}).confirm !== 'LÖSCHEN') return res.status(400).json({ error: 'Bestätigung fehlt' });
  await ingest.wipeMeasurements();
  await logEdit(req, 'alle', '-', 'gelöscht', 'Alle Messwerte', null, null);
  res.json({ ok: true });
}));

// ---------- exports ----------

async function csvHandler(req, res) {
  const range = await D.dataRange();
  const from = T.isDayKey(req.query.from) ? req.query.from : range.first || T.today();
  const to = T.isDayKey(req.query.to) ? req.query.to : range.last && range.last > T.today() ? range.last : T.today();
  const [f, t] = from <= to ? [from, to] : [to, from];
  const days = await D.computeDaily(f, t);
  const name = req.query.from || req.query.to ? `gesundheit-tageswerte_${f}_bis_${t}.csv` : `gesundheit-tageswerte_alle_${T.today()}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buildCsv(days));
}
router.get('/export.csv', wrap(csvHandler));

router.get('/report.pdf', wrap(async (req, res) => {
  const { from, to } = rangeQuery(req, 30);
  const { summary: s, days, derived, profile } = await summary(from, to);
  const ph = await D.loadSamples(['ph'], T.dayStart(from), T.dayStart(T.addDays(to, 1)));
  const analysis = { correlations: correlations(days), tags: tagEffects(days) };
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="gesundheitsbericht_${from}_bis_${to}.pdf"`);
  buildReport(res, { from, to, summary: s, days, derived, profile, ph, analysis });
}));

// ---------- Android app ----------

router.get('/app/download', (req, res) => {
  if (!fs.existsSync(APK_FILE)) return res.status(404).json({ error: 'App wurde noch nicht gebaut' });
  res.download(APK_FILE, 'hc-bridge.apk');
});

router.get('/app/ph/download', (req, res) => {
  if (!fs.existsSync(PH_APK_FILE)) return res.status(404).json({ error: 'App wurde noch nicht gebaut' });
  res.download(PH_APK_FILE, 'ph-app.apk');
});

module.exports = { router, csvHandler };
