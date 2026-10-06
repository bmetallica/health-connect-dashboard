'use strict';

// Effective (edited, not deleted) data access + per-day aggregation.
// Everything that shows day values (charts, CSV, correlations, PDF) uses
// computeDaily(), so all views agree.

const db = require('./db');
const T = require('./time');
const { STAGE_NAMES } = require('./parsers');
const { getProfile, getSourceSettings } = require('./settings');

const SAMPLE_TYPES = ['hr', 'spo2', 'ph', 'resting_hr', 'hrv', 'weight', 'body_fat', 'height', 'temp', 'resp_rate', 'vo2max', 'glucose', 'bp'];
const INTERVAL_TYPES = ['steps', 'distance', 'active_kcal', 'total_kcal', 'floors', 'hydration'];

// ---------- loaders ----------

function effSample(r) {
  return {
    id: r.id,
    type: r.type,
    time: r.edit_time ?? r.time,
    value: r.edit_value ?? r.value,
    value2: r.edit_value2 ?? r.value2,
    rawTime: r.time,
    rawValue: r.value,
    rawValue2: r.value2,
    source: r.source,
    receivedAt: r.received_at,
    manual: !!r.manual,
    deleted: !!r.deleted,
    edited: r.edit_time != null || r.edit_value != null || r.edit_value2 != null,
    editedAt: r.edited_at,
  };
}

async function loadSamples(types, from, to, { includeDeleted = false } = {}) {
  if (!types.length) return [];
  const rows = await db.query(
    `SELECT * FROM samples WHERE type IN (?) AND ((time >= ? AND time < ?) OR (edit_time >= ? AND edit_time < ?))`,
    [types, from, to, from, to]
  );
  return rows
    .map(effSample)
    .filter((s) => (includeDeleted || !s.deleted) && s.time >= from && s.time < to && s.value !== null)
    .sort((a, b) => a.time - b.time);
}

async function loadIntervals(types, from, to) {
  return db.query(
    'SELECT type, start_time, end_time, value, source FROM interval_records WHERE type IN (?) AND start_time >= ? AND start_time < ?',
    [types, from, to]
  );
}

function effSleep(r) {
  const start = r.edit_start ?? r.raw_start;
  const end = r.edit_end ?? r.raw_end;
  let stages = [];
  try {
    stages = JSON.parse(r.stages || '[]');
  } catch {
    // ignore
  }
  // clip stages to the (possibly edited) session window
  stages = stages
    .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end), stage: s.stage }))
    .filter((s) => s.end > s.start)
    .map((s) => ({ ...s, name: STAGE_NAMES[s.stage] || 'unknown' }));
  return {
    id: r.id,
    start,
    end,
    rawStart: r.raw_start,
    rawEnd: r.raw_end,
    durationMs: end - start,
    stages,
    source: r.source,
    manual: !!r.manual,
    deleted: !!r.deleted,
    edited: r.edit_start != null || r.edit_end != null,
    editedAt: r.edited_at,
  };
}

// sessions whose (effective) end lies in [from, to)
async function loadSleep(from, to, { includeDeleted = false } = {}) {
  const rows = await db.query(
    `SELECT * FROM sleep_sessions WHERE (raw_end >= ? AND raw_end < ?) OR (edit_end >= ? AND edit_end < ?)`,
    [from, to, from, to]
  );
  return rows
    .map(effSleep)
    .filter((s) => (includeDeleted || !s.deleted) && s.end >= from && s.end < to && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

async function loadExercise(from, to) {
  return db.query(
    'SELECT * FROM exercise_sessions WHERE deleted = 0 AND start_time >= ? AND start_time < ? ORDER BY start_time',
    [from, to]
  );
}

// ---------- interval aggregation (steps, distance, kcal, ...) ----------

function sourceRank(pkg, priority) {
  const i = priority.findIndex((p) => pkg === p || (pkg || '').startsWith(p + '.') || (pkg || '').startsWith(p));
  return i === -1 ? priority.length : i;
}

// Per day and source: a "daily" record (>= 20 h, e.g. Samsung Health) is the
// source's day total, partial records only count after it ended; otherwise
// partial records are summed. Across sources the configured priority decides
// (default: the band via Health Sync), or the maximum in "max" mode.
function intervalDayTotals(records, srcCfg) {
  const days = new Map();
  for (const r of records) {
    const day = T.dayKey(r.start_time);
    const src = r.source || 'unbekannt';
    if (!days.has(day)) days.set(day, new Map());
    const m = days.get(day);
    if (!m.has(src)) m.set(src, { daily: [], part: [] });
    (r.end_time - r.start_time >= 20 * T.HOUR ? m.get(src).daily : m.get(src).part).push(r);
  }
  const out = new Map();
  for (const [day, m] of days) {
    const bySource = {};
    for (const [src, b] of m) {
      let v;
      if (b.daily.length) {
        const maxEnd = Math.max(...b.daily.map((r) => r.end_time));
        v = Math.max(...b.daily.map((r) => r.value));
        for (const r of b.part) if (r.start_time >= maxEnd) v += r.value;
      } else {
        v = b.part.reduce((a, r) => a + r.value, 0);
      }
      bySource[src] = v;
    }
    const entries = Object.entries(bySource).filter(([, v]) => v > 0);
    if (!entries.length) {
      out.set(day, { value: 0, source: null, bySource });
      continue;
    }
    let pick;
    if (srcCfg.mode === 'max') {
      pick = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    } else {
      pick = entries.reduce((a, b) => {
        const ra = sourceRank(a[0], srcCfg.priority);
        const rb = sourceRank(b[0], srcCfg.priority);
        return rb < ra || (rb === ra && b[1] > a[1]) ? b : a;
      });
    }
    out.set(day, { value: pick[1], source: pick[0], bySource });
  }
  return out;
}

// merged total of possibly overlapping intervals
function unionMs(intervals) {
  const iv = intervals.map((s) => [s.start, s.end]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur = null;
  for (const [s, e] of iv) {
    if (!cur) cur = [s, e];
    else if (s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else {
      total += cur[1] - cur[0];
      cur = [s, e];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

function stageTotals(stages) {
  const agg = {};
  for (const s of stages) agg[s.name] = (agg[s.name] || 0) + (s.end - s.start);
  return agg;
}

// ---------- daily computation ----------

function newDay(key) {
  return {
    day: key,
    hr: null, resting: null, hrv: null,
    steps: null, stepsSource: null, stepsEdited: false, stepsOriginal: null,
    distance: null, activeKcal: null, totalKcal: null, floors: null, hydration: null,
    sleep: null,
    spo2: null,
    ph: [], phAvg: null,
    weight: null, bmi: null, bodyFat: null,
    bp: null, temp: null, respRate: null, vo2max: null, glucose: null,
    exercise: [],
    note: null, tags: [],
  };
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

async function computeDaily(fromKey, toKey) {
  const from = T.dayStart(fromKey);
  const to = T.dayStart(T.addDays(toKey, 1));
  const [samples, intervals, sleep, exercise, overrides, notes, tagRows, profile, srcCfg] = await Promise.all([
    loadSamples(SAMPLE_TYPES, from, to),
    loadIntervals(INTERVAL_TYPES, from, to),
    loadSleep(from, to),
    loadExercise(from, to),
    db.query('SELECT * FROM day_overrides WHERE day >= ? AND day <= ?', [fromKey, toKey]),
    db.query('SELECT day, note FROM day_notes WHERE day >= ? AND day <= ?', [fromKey, toKey]),
    db.query('SELECT dt.day, t.id, t.name, t.color FROM day_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.day >= ? AND dt.day <= ? ORDER BY t.sort, t.name', [fromKey, toKey]),
    getProfile(),
    getSourceSettings(),
  ]);

  const days = new Map();
  for (const k of T.dayRange(fromKey, toKey)) days.set(k, newDay(k));
  const get = (k) => days.get(k);

  // instant samples grouped per day and type
  const buckets = new Map();
  for (const s of samples) {
    const d = get(T.dayKey(s.time));
    if (!d) continue;
    if (s.type === 'ph') {
      d.ph.push({ id: s.id, time: s.time, value: s.value, receivedAt: s.receivedAt, edited: s.edited, manual: s.manual });
      continue;
    }
    const k = d.day + '|' + s.type;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  let height = profile && profile.heightCm ? profile.heightCm / 100 : null;
  for (const [k, list] of buckets) {
    const [day, type] = k.split('|');
    const d = get(day);
    const vals = list.map((s) => s.value);
    switch (type) {
      case 'hr':
        d.hr = { avg: avg(vals), min: Math.min(...vals), max: Math.max(...vals), count: vals.length };
        break;
      case 'spo2':
        d.spo2 = { avg: avg(vals), min: Math.min(...vals), max: Math.max(...vals), count: vals.length };
        break;
      case 'resting_hr':
        d.resting = { value: avg(vals), measured: true };
        break;
      case 'hrv': d.hrv = avg(vals); break;
      case 'weight': d.weight = avg(vals); break;
      case 'body_fat': d.bodyFat = avg(vals); break;
      case 'temp': d.temp = avg(vals); break;
      case 'resp_rate': d.respRate = avg(vals); break;
      case 'vo2max': d.vo2max = avg(vals); break;
      case 'glucose': d.glucose = avg(vals); break;
      case 'height': height = avg(vals); break;
      case 'bp':
        d.bp = { sys: avg(vals), dia: avg(list.map((s) => s.value2).filter((v) => v != null)) };
        break;
      default:
    }
  }
  for (const d of days.values()) {
    // resting HR fallback: lowest value of the day (needs enough samples)
    if (!d.resting && d.hr && d.hr.count >= 5) d.resting = { value: d.hr.min, measured: false };
    if (d.ph.length) d.phAvg = avg(d.ph.map((x) => x.value));
    if (d.weight && height) d.bmi = d.weight / (height * height);
  }

  // interval totals
  const byType = new Map();
  for (const r of intervals) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type).push(r);
  }
  const field = { steps: 'steps', distance: 'distance', active_kcal: 'activeKcal', total_kcal: 'totalKcal', floors: 'floors', hydration: 'hydration' };
  for (const [type, recs] of byType) {
    for (const [day, t] of intervalDayTotals(recs, srcCfg)) {
      const d = get(day);
      if (!d) continue;
      d[field[type]] = type === 'distance' ? t.value / 1000 : t.value;
      if (type === 'steps') d.stepsSource = t.source;
    }
  }
  for (const o of overrides) {
    const d = get(o.day);
    if (!d || !field[o.type]) continue;
    if (o.type === 'steps') {
      d.stepsOriginal = d.steps;
      d.stepsEdited = true;
    }
    d[field[o.type]] = o.value;
  }

  // sleep: nights belong to the day they end
  const sleepByDay = new Map();
  for (const s of sleep) {
    const k = T.dayKey(s.end);
    if (!sleepByDay.has(k)) sleepByDay.set(k, []);
    sleepByDay.get(k).push(s);
  }
  for (const [k, list] of sleepByDay) {
    const d = get(k);
    if (!d) continue;
    const main = list.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
    const totalMs = unionMs(list);
    d.sleep = {
      totalMs,
      start: main.start,
      end: main.end,
      sessions: list.length,
      stages: stageTotals(main.stages),
      mainDurationMs: main.durationMs,
    };
  }

  for (const e of exercise) {
    const d = get(T.dayKey(e.start_time));
    if (d) d.exercise.push({ id: e.id, type: e.exercise_type, title: e.title, start: e.start_time, end: e.end_time });
  }
  for (const n of notes) if (get(n.day)) get(n.day).note = n.note;
  for (const t of tagRows) if (get(t.day)) get(t.day).tags.push({ id: t.id, name: t.name, color: t.color });

  return [...days.values()];
}

// first and last day with any data
async function dataRange() {
  const rows = await db.query(`
    SELECT MIN(t) AS first, MAX(t) AS last FROM (
      SELECT MIN(COALESCE(edit_time, time)) AS t FROM samples WHERE deleted = 0
      UNION ALL SELECT MAX(COALESCE(edit_time, time)) FROM samples WHERE deleted = 0
      UNION ALL SELECT MIN(start_time) FROM interval_records
      UNION ALL SELECT MAX(start_time) FROM interval_records
      UNION ALL SELECT MIN(raw_end) FROM sleep_sessions WHERE deleted = 0
      UNION ALL SELECT MAX(raw_end) FROM sleep_sessions WHERE deleted = 0
    ) x`);
  const r = rows[0] || {};
  return {
    first: r.first ? T.dayKey(Number(r.first)) : null,
    last: r.last ? T.dayKey(Number(r.last)) : null,
  };
}

// which measurement types have data at all (drives which views are shown)
async function availableTypes() {
  const s = await db.query('SELECT type, COUNT(*) AS n FROM samples WHERE deleted = 0 GROUP BY type');
  const i = await db.query('SELECT type, COUNT(*) AS n FROM interval_records GROUP BY type');
  const sl = await db.query('SELECT COUNT(*) AS n FROM sleep_sessions WHERE deleted = 0');
  const ex = await db.query('SELECT COUNT(*) AS n FROM exercise_sessions WHERE deleted = 0');
  const out = {};
  for (const r of s) out[r.type] = Number(r.n);
  for (const r of i) out[r.type] = Number(r.n);
  out.sleep = Number(sl[0].n);
  out.exercise = Number(ex[0].n);
  return out;
}

module.exports = {
  SAMPLE_TYPES, INTERVAL_TYPES, loadSamples, loadIntervals, loadSleep, loadExercise, effSample, effSleep,
  computeDaily, intervalDayTotals, dataRange, availableTypes, unionMs, stageTotals,
};
