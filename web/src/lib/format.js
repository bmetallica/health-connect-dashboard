// formatting + date helpers; all calendar days are in the server's timezone
// (Europe/Berlin), independent of the viewing device

export const DAY = 86400000;
let TZ = 'Europe/Berlin';
export function setTimeZone(tz) {
  if (tz) TZ = tz;
  cache.clear();
}

const cache = new Map();
function dtf(opts) {
  const k = JSON.stringify(opts);
  if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat('de-DE', { timeZone: TZ, ...opts }));
  return cache.get(k);
}
function partsOf(t) {
  const p = {};
  for (const { type, value } of dtf({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t))) p[type] = value;
  return p;
}
function offsetAt(t) {
  const p = partsOf(t);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

export function dayKey(t) {
  return new Date(t + offsetAt(t)).toISOString().slice(0, 10);
}
export function today() {
  return dayKey(Date.now());
}
export function addDays(key, n) {
  return new Date(Date.parse(key + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}
export function dayStart(key) {
  const g = Date.parse(key + 'T00:00:00Z');
  let t = g - offsetAt(g);
  return g - offsetAt(t);
}
// 'YYYY-MM-DDTHH:MM' (local) for <input type=datetime-local>
export function toLocalInput(t) {
  return new Date(t + offsetAt(t)).toISOString().slice(0, 16);
}
export function nowLocalInput() {
  return toLocalInput(Date.now());
}
export function weekday(key) {
  return new Date(key + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monthName = (m) => MONTHS[m];

export function fmtDay(key, { weekday: wd = true, year = false } = {}) {
  if (!key) return '–';
  const [y, m, d] = key.split('-');
  return `${wd ? WD[weekday(key)] + ', ' : ''}${d}.${m}.${year ? y : ''}`;
}
export function fmtDayLong(key) {
  const [y, m, d] = key.split('-');
  return `${WD[weekday(key)]}, ${+d}. ${MONTHS[+m - 1]} ${y}`;
}
export function relDay(key) {
  const t = today();
  if (key === t) return 'Heute';
  if (key === addDays(t, -1)) return 'Gestern';
  return fmtDay(key);
}
export function fmtTime(t) {
  return t == null ? '–' : dtf({ hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}
export function fmtDateTime(t) {
  if (t == null) return '–';
  return `${fmtDay(dayKey(t), { year: true })} ${fmtTime(t)}`;
}
export function timeAgo(t) {
  if (!t) return 'nie';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

export function num(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function dur(ms) {
  if (ms == null) return '–';
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}
export function hours(ms, digits = 1) {
  return ms == null ? '–' : num(ms / 3600000, digits);
}
export function parseNumber(s) {
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
export function bytes(n) {
  if (n == null) return '–';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return num(n / 1024, 0) + ' KB';
  if (n < 1073741824) return num(n / 1048576, 1) + ' MB';
  return num(n / 1073741824, 2) + ' GB';
}
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
