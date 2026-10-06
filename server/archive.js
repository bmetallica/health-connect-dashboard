'use strict';

// Raw archive: every received payload is stored unchanged.
//   data/raw/YYYY-MM.jsonl.gz  one gzip member per record (the file as a whole
//                              is a regular .jsonl.gz, `zcat` works)
//   data/raw/YYYY-MM.idx       one JSON line per record: id, receivedAt,
//                              source, summary, byte offset/length of its member
// The index line is written before the gzip member, so after a crash either
// both are complete or the dangling index entry is dropped on startup.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const readline = require('readline');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DATA_DIR = process.env.DATA_DIR || '/data';
const RAW_DIR = path.join(DATA_DIR, 'raw');
fs.mkdirSync(RAW_DIR, { recursive: true });

// month -> { entries: [...], size: gz bytes }
const months = new Map();

function gzFile(month) {
  return path.join(RAW_DIR, `${month}.jsonl.gz`);
}
function idxFile(month) {
  return path.join(RAW_DIR, `${month}.idx`);
}

function summarize(p) {
  if (p === null || p === undefined) return 'leer';
  if (Array.isArray(p)) {
    const types = p.map((x) => x && x.record_type).filter(Boolean);
    if (types.length) {
      const n = p.reduce((a, x) => a + ((x && x.data && Array.isArray(x.data.records) && x.data.records.length) || 0), 0);
      return `Health Connect: ${types.map((t) => t.replace(/Record$/, '')).join(', ')} (${n} Einträge)`;
    }
    return `Array (${p.length} Elemente)`;
  }
  if (typeof p === 'object') {
    if (typeof p.phValue === 'number') return `pH ${p.phValue}`;
    return `Objekt: ${Object.keys(p).slice(0, 6).join(', ')}`;
  }
  return `${typeof p}: ${String(p).slice(0, 60)}`;
}

// sender of a payload: explicit X-Source header wins, otherwise guessed
function detectSource(payload, header) {
  if (header) return String(header).slice(0, 64);
  if (Array.isArray(payload) && payload.some((x) => x && x.record_type)) return 'tasker';
  if (payload && typeof payload === 'object' && typeof payload.phValue === 'number') return 'ph-app';
  return 'unbekannt';
}

function loadMonth(month) {
  if (months.has(month)) return months.get(month);
  const m = { entries: [], size: 0 };
  let gzSize = 0;
  try {
    gzSize = fs.statSync(gzFile(month)).size;
  } catch {
    // new month
  }
  let raw = '';
  try {
    raw = fs.readFileSync(idxFile(month), 'utf8');
  } catch {
    // no index yet
  }
  let validBytes = 0;
  let dirty = false;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      dirty = true;
      continue;
    }
    if (e.off + e.len > gzSize || e.off !== validBytes) {
      dirty = true; // incomplete write (crash) -> drop
      continue;
    }
    m.entries.push(e);
    validBytes = e.off + e.len;
  }
  if (gzSize > validBytes) {
    // partial gzip member without a valid index entry
    fs.truncateSync(gzFile(month), validBytes);
    dirty = true;
  }
  if (dirty) fs.writeFileSync(idxFile(month), m.entries.map((e) => JSON.stringify(e) + '\n').join(''));
  m.size = validBytes;
  months.set(month, m);
  return m;
}

function listMonths() {
  const set = new Set();
  for (const f of fs.readdirSync(RAW_DIR)) {
    const mm = /^(\d{4}-\d{2})\.(idx|jsonl\.gz)$/.exec(f);
    if (mm) set.add(mm[1]);
  }
  return [...set].sort();
}

// serialize all writes
let chain = Promise.resolve();
function serial(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

// append one record; `line` (optional) is the exact original JSON line for legacy imports
function append(record, line) {
  return serial(async () => {
    const text = (line || JSON.stringify(record)) + '\n';
    const buf = await gzip(text);
    const month = record.receivedAt.slice(0, 7);
    const m = loadMonth(month);
    const entry = {
      id: record.id,
      receivedAt: record.receivedAt,
      source: record.source || null,
      summary: summarize(record.payload),
      off: m.size,
      len: buf.length,
      bytes: Buffer.byteLength(text),
    };
    await fs.promises.appendFile(idxFile(month), JSON.stringify(entry) + '\n');
    await fs.promises.appendFile(gzFile(month), buf);
    m.entries.push(entry);
    m.size += buf.length;
    return entry;
  });
}

async function readEntry(month, entry) {
  const fh = await fs.promises.open(gzFile(month), 'r');
  try {
    const buf = Buffer.alloc(entry.len);
    await fh.read(buf, 0, entry.len, entry.off);
    const text = (await gunzip(buf)).toString('utf8');
    return JSON.parse(text);
  } finally {
    await fh.close();
  }
}

function entries(month) {
  return loadMonth(month).entries;
}

function allEntries() {
  const out = [];
  for (const month of listMonths()) for (const e of entries(month)) out.push({ month, e });
  return out;
}

function findEntry(id) {
  for (const month of listMonths().reverse()) {
    const e = entries(month).find((x) => x.id === id);
    if (e) return { month, e };
  }
  return null;
}

// last receipt per source (for the "data sources" overview)
function lastBySource() {
  const out = {};
  for (const month of listMonths()) {
    for (const e of entries(month)) {
      const s = e.source || 'unbekannt';
      if (!out[s] || e.receivedAt > out[s].last) out[s] = { last: e.receivedAt, count: (out[s] ? out[s].count : 0) + 1 };
      else out[s].count++;
    }
  }
  return out;
}

// ---------- one-time import of the old data/records.jsonl ----------
// The original file is only read. Progress is kept in data/raw/.legacy.json
// (byte offset), so an interrupted import resumes and later appends are picked up.
async function importLegacy(log) {
  const legacy = path.join(DATA_DIR, 'records.jsonl');
  let size;
  try {
    size = fs.statSync(legacy).size;
  } catch {
    return 0;
  }
  const stateFile = path.join(RAW_DIR, '.legacy.json');
  let state = { offset: 0, imported: 0 };
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    // first run
  }
  if (state.offset >= size) return 0;
  // ids already archived (resume safety)
  const known = new Set(allEntries().map((x) => x.e.id));
  log(`[archive] importing legacy records.jsonl from byte ${state.offset} of ${size}`);
  const stream = fs.createReadStream(legacy, { start: state.offset });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let offset = state.offset;
  let n = 0;
  let last = Date.now();
  for await (const line of rl) {
    offset += Buffer.byteLength(line) + 1;
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (!rec.id || !rec.receivedAt || known.has(rec.id)) continue;
    rec.source = detectSource(rec.payload);
    await append(rec, line);
    known.add(rec.id);
    n++;
    if (Date.now() - last > 5000) {
      last = Date.now();
      fs.writeFileSync(stateFile, JSON.stringify({ offset, imported: (state.imported || 0) + n }));
      log(`[archive] legacy import: ${Math.round((offset / size) * 100)} %`);
    }
  }
  state = { offset: Math.min(offset, size), imported: (state.imported || 0) + n, finishedAt: new Date().toISOString() };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  log(`[archive] legacy import finished: ${n} records`);
  return n;
}

module.exports = {
  RAW_DIR, append, readEntry, entries, allEntries, listMonths, findEntry, lastBySource, detectSource, summarize, gzFile, importLegacy,
};
