'use strict';

// Ingest pipeline: archive first (nothing is lost even if the DB is down),
// then normalize into MariaDB. Writes are idempotent; re-sent data only
// updates the raw columns, manual edits live in separate columns and are
// never touched here.

const crypto = require('crypto');
const db = require('./db');
const archive = require('./archive');
const { parsePayload, parseItem, SUPPORTED } = require('./parsers');
const { parseLocal } = require('./time');

const log = (...a) => console.log(...a);

// caches of what is already stored, so the large repeated Tasker payloads
// (same ~200 KB every 5 minutes) cause almost no DB writes
const cache = { samples: new Map(), intervals: new Map(), sleep: new Set(), exercise: new Map() };
function clearCache() {
  cache.samples.clear();
  cache.intervals.clear();
  cache.sleep.clear();
  cache.exercise.clear();
}

async function bulk(sql, rows, width, suffix) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const ph = part.map(() => '(' + new Array(width).fill('?').join(',') + ')').join(',');
    await db.query(`${sql} VALUES ${ph} ${suffix}`, part.flat());
  }
}

async function writeSamples(rows, receivedAt) {
  const dedup = new Map();
  for (const r of rows) dedup.set(r.type + '|' + r.time, r);
  const todo = [];
  for (const [k, r] of dedup) {
    const sig = r.value + '|' + (r.value2 ?? '');
    if (cache.samples.get(k) === sig) continue;
    todo.push([r.type, r.time, r.value, r.value2 ?? null, r.source || null, receivedAt]);
    cache.samples.set(k, sig);
  }
  if (!todo.length) return 0;
  await bulk(
    'INSERT INTO samples (type, time, value, value2, source, received_at)',
    todo,
    6,
    `ON DUPLICATE KEY UPDATE
       value = IF(manual = 1, value, VALUES(value)),
       value2 = IF(manual = 1, value2, VALUES(value2)),
       source = IF(manual = 1, source, VALUES(source))`
  );
  return todo.length;
}

async function writeIntervals(rows) {
  const dedup = new Map();
  for (const r of rows) {
    const o = dedup.get(r.uid);
    if (!o || (r.lastModified || 0) >= (o.lastModified || 0)) dedup.set(r.uid, r);
  }
  const todo = [];
  for (const [uid, r] of dedup) {
    const sig = `${r.lastModified}|${r.value}|${r.start}|${r.end}`;
    if (cache.intervals.get(uid) === sig) continue;
    todo.push([uid, r.type, r.start, r.end, r.value, r.source || null, r.lastModified]);
    cache.intervals.set(uid, sig);
  }
  if (!todo.length) return 0;
  const newer = '(VALUES(last_modified) IS NULL OR last_modified IS NULL OR VALUES(last_modified) >= last_modified)';
  await bulk(
    'INSERT INTO interval_records (uid, type, start_time, end_time, value, source, last_modified)',
    todo,
    7,
    `ON DUPLICATE KEY UPDATE
       start_time = IF(${newer}, VALUES(start_time), start_time),
       end_time = IF(${newer}, VALUES(end_time), end_time),
       value = IF(${newer}, VALUES(value), value),
       last_modified = IF(${newer}, VALUES(last_modified), last_modified)`
  );
  return todo.length;
}

function mergeStages(a, b) {
  const m = new Map();
  for (const s of a || []) m.set(s.start, s);
  for (const s of b || []) m.set(s.start, s);
  return [...m.values()].sort((x, y) => x.start - y.start);
}

// Health Sync re-sends a running night (same start, later end, new id):
// overlapping sessions are merged into one row (also into deleted rows, so a
// night deleted by hand does not come back with the next sync)
async function writeSleep(sessions, receivedAt) {
  let n = 0;
  for (const s of sessions.sort((a, b) => a.start - b.start)) {
    const sig = `${s.hcId}|${s.start}|${s.end}|${s.stages.length}`;
    if (cache.sleep.has(sig)) continue;
    await db.tx(async (q) => {
      const rows = await q(
        'SELECT * FROM sleep_sessions WHERE manual = 0 AND raw_start < ? AND raw_end > ? ORDER BY id FOR UPDATE',
        [s.end, s.start]
      );
      if (!rows.length) {
        await q(
          'INSERT INTO sleep_sessions (raw_start, raw_end, stages, source, hc_ids, received_at) VALUES (?, ?, ?, ?, ?, ?)',
          [s.start, s.end, JSON.stringify(s.stages), s.source, JSON.stringify(s.hcId ? [s.hcId] : []), receivedAt]
        );
        return;
      }
      const keep = rows[0];
      let start = s.start;
      let end = s.end;
      let stages = s.stages;
      let ids = new Set(s.hcId ? [s.hcId] : []);
      let edit = keep.edit_start != null || keep.edit_end != null ? keep : rows.find((r) => r.edit_start != null || r.edit_end != null);
      // the longer version's stages win where both have a stage at the same start
      const sorted = rows.slice().sort((a, b) => (a.raw_end - a.raw_start) - (b.raw_end - b.raw_start));
      let merged = [];
      for (const r of sorted) merged = mergeStages(merged, JSON.parse(r.stages || '[]'));
      stages = s.end - s.start >= keep.raw_end - keep.raw_start ? mergeStages(merged, stages) : mergeStages(stages, merged);
      for (const r of rows) {
        start = Math.min(start, r.raw_start);
        end = Math.max(end, r.raw_end);
        for (const id of JSON.parse(r.hc_ids || '[]')) ids.add(id);
      }
      await q(
        `UPDATE sleep_sessions SET raw_start = ?, raw_end = ?, stages = ?, hc_ids = ?, source = COALESCE(source, ?),
           deleted = ?, edit_start = ?, edit_end = ?, edited_at = ? WHERE id = ?`,
        [start, end, JSON.stringify(stages), JSON.stringify([...ids]), s.source,
          rows.some((r) => r.deleted) ? 1 : 0,
          edit ? edit.edit_start : null, edit ? edit.edit_end : null, edit ? edit.edited_at : null, keep.id]
      );
      if (rows.length > 1) await q('DELETE FROM sleep_sessions WHERE id IN (?)', [rows.slice(1).map((r) => r.id)]);
    });
    cache.sleep.add(sig);
    n++;
  }
  return n;
}

async function writeExercise(rows) {
  const todo = [];
  for (const r of rows) {
    const sig = `${r.lastModified}|${r.start}|${r.end}`;
    if (cache.exercise.get(r.uid) === sig) continue;
    cache.exercise.set(r.uid, sig);
    todo.push([r.uid, r.exerciseType, r.title, r.notes, r.start, r.end, r.source, r.lastModified]);
  }
  if (!todo.length) return 0;
  await bulk(
    'INSERT INTO exercise_sessions (uid, exercise_type, title, notes, start_time, end_time, source, last_modified)',
    todo,
    8,
    `ON DUPLICATE KEY UPDATE exercise_type = VALUES(exercise_type), title = VALUES(title), notes = VALUES(notes),
       start_time = VALUES(start_time), end_time = VALUES(end_time), last_modified = VALUES(last_modified)`
  );
  return todo.length;
}

async function writeUnknown(rows, receivedAt) {
  if (!rows.length) return;
  const vals = rows.map(({ recordType, record }) => {
    const id = record && record.metadata && record.metadata.id;
    const data = JSON.stringify(record);
    const uid = recordType + ':' + (id || crypto.createHash('sha1').update(data).digest('hex'));
    return [uid.slice(0, 160), recordType.slice(0, 96), data, receivedAt];
  });
  await bulk('INSERT IGNORE INTO unknown_records (uid, record_type, data, received_at)', vals, 4, '');
}

// normalize one archived record into the database
async function processRecord(rec) {
  const receivedAt = Date.parse(rec.receivedAt) || Date.now();
  const out = parsePayload(rec.payload);
  if (out.ph) {
    let t = out.ph.time;
    if (!Number.isFinite(t)) t = parseLocal(`${out.ph.date}T${out.ph.clock}`);
    if (!Number.isFinite(t)) t = receivedAt;
    out.samples.push({ type: 'ph', time: t, value: out.ph.value, source: rec.source || 'ph-app' });
  }
  await writeSamples(out.samples, receivedAt);
  await writeIntervals(out.intervals);
  await writeSleep(out.sleep, receivedAt);
  await writeExercise(out.exercise);
  await writeUnknown(out.unknown, receivedAt);
  await db.query('INSERT IGNORE INTO raw_processed (id, processed_at) VALUES (?, ?)', [rec.id, Date.now()]);
}

// ---------- serialized processing queue ----------
let chain = Promise.resolve();
function serial(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

const status = { backlog: 0, done: 0, running: false, lastError: null };

// called by the HTTP endpoint: archive, then process (a DB failure is not an
// error for the sender, the record is archived and picked up by catchUp())
async function ingest(payload, sourceHeader) {
  const rec = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    source: archive.detectSource(payload, sourceHeader),
    payload,
  };
  await archive.append(rec);
  serial(() => processRecord(rec)).catch((e) => {
    status.lastError = `${new Date().toISOString()} ${e.message}`;
    log('[ingest] processing failed, will retry:', e.message);
    scheduleCatchUp();
  });
  return rec;
}

// process every archived record that is not in the database yet
function catchUp() {
  return serial(async () => {
    const done = new Set((await db.query('SELECT id FROM raw_processed')).map((r) => r.id));
    const todo = archive.allEntries().filter(({ e }) => !done.has(e.id));
    if (!todo.length) return 0;
    status.running = true;
    status.backlog = todo.length;
    status.done = 0;
    log(`[ingest] processing ${todo.length} archived records`);
    let last = Date.now();
    try {
      for (const { month, e } of todo) {
        const rec = await archive.readEntry(month, e);
        rec.source = e.source || rec.source;
        await processRecord(rec);
        status.done++;
        if (Date.now() - last > 10000) {
          last = Date.now();
          log(`[ingest] ${status.done}/${status.backlog}`);
        }
      }
    } finally {
      status.running = false;
    }
    log(`[ingest] catch-up finished (${status.done} records)`);
    return status.done;
  });
}

let catchUpTimer = null;
function scheduleCatchUp() {
  if (catchUpTimer) return;
  catchUpTimer = setTimeout(() => {
    catchUpTimer = null;
    catchUp().catch((e) => {
      status.lastError = `${new Date().toISOString()} ${e.message}`;
      scheduleCatchUp();
    });
  }, 60000);
}

// record types that became supported since they were stored as unknown
async function reprocessUnknown() {
  const types = (await db.query('SELECT DISTINCT record_type FROM unknown_records')).map((r) => r.record_type);
  for (const t of types.filter((x) => SUPPORTED.has(x))) {
    const rows = await db.query('SELECT id, data, received_at FROM unknown_records WHERE record_type = ?', [t]);
    const out = { samples: [], intervals: [], sleep: [], exercise: [], unknown: [] };
    parseItem(t, rows.map((r) => JSON.parse(r.data)), out);
    await writeSamples(out.samples, rows[0].received_at);
    await writeIntervals(out.intervals);
    await writeSleep(out.sleep, rows[0].received_at);
    await writeExercise(out.exercise);
    await db.query('DELETE FROM unknown_records WHERE record_type = ?', [t]);
    log(`[ingest] reprocessed ${rows.length} stored ${t}`);
  }
}

// "Alle löschen": measurement tables only; the archive and the processed
// markers stay, so nothing is re-imported automatically
async function wipeMeasurements() {
  return serial(async () => {
    for (const t of ['samples', 'interval_records', 'day_overrides', 'sleep_sessions', 'exercise_sessions', 'unknown_records']) {
      await db.query(`DELETE FROM ${t}`);
    }
    clearCache();
  });
}

// rebuild from the archive: edits are kept (they live in separate columns)
async function rebuildFromArchive() {
  await serial(async () => {
    await db.query('DELETE FROM raw_processed');
    clearCache();
  });
  catchUp().catch((e) => log('[ingest] rebuild failed:', e.message));
}

module.exports = { ingest, catchUp, reprocessUnknown, wipeMeasurements, rebuildFromArchive, status, scheduleCatchUp };
