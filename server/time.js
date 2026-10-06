'use strict';

// All day boundaries are local calendar days in a fixed timezone
// (default Europe/Berlin), independent of the viewing device.

const TZ = process.env.APP_TZ || 'Europe/Berlin';
const DAY = 86400000;
const HOUR = 3600000;

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// UTC offset (ms) at instant t; cached per hour (DST changes happen on full hours)
const offsetCache = new Map();
function offsetAt(t) {
  const h = Math.floor(t / HOUR);
  let off = offsetCache.get(h);
  if (off === undefined) {
    const p = {};
    for (const { type, value } of dtf.formatToParts(new Date(h * HOUR))) p[type] = value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    off = asUtc - h * HOUR;
    if (offsetCache.size > 200000) offsetCache.clear();
    offsetCache.set(h, off);
  }
  return off;
}

// 'YYYY-MM-DD' of the local day containing t
function dayKey(t) {
  return new Date(t + offsetAt(t)).toISOString().slice(0, 10);
}

// 'HH:MM' local time
function timeHM(t) {
  return new Date(t + offsetAt(t)).toISOString().slice(11, 16);
}

// 'YYYY-MM-DDTHH:MM' local
function localIso(t) {
  return new Date(t + offsetAt(t)).toISOString().slice(0, 16);
}

// ms epoch of local midnight starting the given day key
function dayStart(key) {
  const guess = Date.parse(key + 'T00:00:00Z');
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

// local 'YYYY-MM-DDTHH:MM' (or with seconds) -> ms epoch
function parseLocal(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s || '');
  if (!m) return NaN;
  const guess = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}Z`);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

function addDays(key, n) {
  return new Date(Date.parse(key + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}

function today() {
  return dayKey(Date.now());
}

// inclusive list of day keys
function dayRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
function isDayKey(s) {
  return typeof s === 'string' && DATE_KEY.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}

function formatDE(key) {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
}

module.exports = {
  TZ, DAY, HOUR, dayKey, timeHM, localIso, dayStart, parseLocal, addDays, daysBetween, today, dayRange, isDayKey, formatDE,
};
