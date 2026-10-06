'use strict';

// Health Connect record parsers. Each payload item looks like
//   { record_type: 'HeartRateRecord', data: { records: [ ... ] } }
// and is turned into normalized rows:
//   samples   { type, time, value, value2?, source }
//   intervals { uid, type, start, end, value, source, lastModified }
//   sleep     { start, end, stages, source, hcId }
//   exercise  { uid, exerciseType, title, notes, start, end, source, lastModified }

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// units arrive either as androidx-style getters ({inKilograms: 75}) or as a
// serialized value/type pair ({value: 75, type: 'KILOGRAMS'}) or as a number
function unit(obj, getter, factors) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'number') return num(obj);
  if (typeof obj !== 'object') return null;
  if (num(obj[getter]) !== null) return obj[getter];
  const t = String(obj.type || obj.unit || '').toUpperCase();
  const v = num(obj.value);
  if (v === null) return null;
  if (!t) return v;
  for (const [k, f] of Object.entries(factors)) if (t === k) return typeof f === 'function' ? f(v) : v * f;
  return v;
}
const MASS = { KILOGRAMS: 1, GRAMS: 0.001, MILLIGRAMS: 1e-6, MICROGRAMS: 1e-9, POUNDS: 0.45359237, OUNCES: 0.028349523 };
const LENGTH = { METERS: 1, KILOMETERS: 1000, MILES: 1609.344, INCHES: 0.0254, FEET: 0.3048 };
const ENERGY = { KILOCALORIES: 1, CALORIES: 0.001, JOULES: 1 / 4184, KILOJOULES: 1 / 4.184 };
const TEMP = { CELSIUS: 1, FAHRENHEIT: (f) => ((f - 32) * 5) / 9, KELVIN: (k) => k - 273.15 };
const PRESSURE = { MILLIMETERS_OF_MERCURY: 1 };
const VOLUME = { LITERS: 1, MILLILITERS: 0.001, FLUID_OUNCES_US: 0.0295735 };

const kg = (o) => unit(o, 'inKilograms', MASS);
const meters = (o) => unit(o, 'inMeters', LENGTH);
const kcal = (o) => unit(o, 'inKilocalories', ENERGY);
const celsius = (o) => unit(o, 'inCelsius', TEMP);
const mmHg = (o) => unit(o, 'inMillimetersOfMercury', PRESSURE);
const liters = (o) => unit(o, 'inLiters', VOLUME);
const pct = (o) => (o && typeof o === 'object' ? num(o.value) : num(o));

function sourceOf(r) {
  const md = r.metadata || {};
  return (md.dataOrigin && md.dataOrigin.packageName) || null;
}
function uidOf(type, r) {
  const md = r.metadata || {};
  return md.id ? `${type}:${md.id}` : `${type}:${r.startTime}:${r.endTime}:${sourceOf(r)}`;
}
function lastModOf(r) {
  return num((r.metadata || {}).lastModifiedTime);
}

// single-value instant records: [record type, sample type, value extractor]
const INSTANT = {
  OxygenSaturationRecord: ['spo2', (r) => pct(r.percentage)],
  RestingHeartRateRecord: ['resting_hr', (r) => num(r.beatsPerMinute)],
  HeartRateVariabilityRmssdRecord: ['hrv', (r) => num(r.heartRateVariabilityMillis)],
  WeightRecord: ['weight', (r) => kg(r.weight)],
  BodyFatRecord: ['body_fat', (r) => pct(r.percentage)],
  HeightRecord: ['height', (r) => meters(r.height)],
  BodyTemperatureRecord: ['temp', (r) => celsius(r.temperature)],
  RespiratoryRateRecord: ['resp_rate', (r) => num(r.rate)],
  Vo2MaxRecord: ['vo2max', (r) => num(r.vo2MillilitersPerMinuteKilogram)],
  BloodGlucoseRecord: ['glucose', (r) => unit(r.level, 'inMilligramsPerDeciliter', { MILLIGRAMS_PER_DECILITER: 1, MILLIMOLES_PER_LITER: 18.0182 })],
};

// interval records summed per day: [type, value extractor]
const INTERVAL = {
  StepsRecord: ['steps', (r) => num(r.count)],
  DistanceRecord: ['distance', (r) => meters(r.distance)],
  ActiveCaloriesBurnedRecord: ['active_kcal', (r) => kcal(r.energy)],
  TotalCaloriesBurnedRecord: ['total_kcal', (r) => kcal(r.energy)],
  FloorsClimbedRecord: ['floors', (r) => num(r.floors)],
  HydrationRecord: ['hydration', (r) => liters(r.volume)],
};

const SUPPORTED = new Set([
  'HeartRateRecord', 'SleepSessionRecord', 'ExerciseSessionRecord', 'BloodPressureRecord',
  ...Object.keys(INSTANT), ...Object.keys(INTERVAL),
]);

function parseItem(recordType, records, out) {
  if (recordType === 'HeartRateRecord') {
    for (const r of records) {
      const source = sourceOf(r);
      for (const s of r.samples || []) {
        const t = num(s && s.time);
        const v = num(s && s.beatsPerMinute);
        if (t !== null && v !== null) out.samples.push({ type: 'hr', time: t, value: v, source });
      }
    }
    return true;
  }
  if (recordType === 'BloodPressureRecord') {
    for (const r of records) {
      const t = num(r.time);
      const sys = mmHg(r.systolic);
      const dia = mmHg(r.diastolic);
      if (t !== null && sys !== null) out.samples.push({ type: 'bp', time: t, value: sys, value2: dia, source: sourceOf(r) });
    }
    return true;
  }
  if (INSTANT[recordType]) {
    const [type, fn] = INSTANT[recordType];
    for (const r of records) {
      const t = num(r.time);
      const v = fn(r);
      if (t !== null && v !== null) out.samples.push({ type, time: t, value: v, source: sourceOf(r) });
    }
    return true;
  }
  if (INTERVAL[recordType]) {
    const [type, fn] = INTERVAL[recordType];
    for (const r of records) {
      const start = num(r.startTime);
      const end = num(r.endTime);
      const v = fn(r);
      if (start === null || end === null || v === null) continue;
      out.intervals.push({ uid: uidOf(type, r), type, start, end, value: v, source: sourceOf(r), lastModified: lastModOf(r) });
    }
    return true;
  }
  if (recordType === 'SleepSessionRecord') {
    for (const r of records) {
      const start = num(r.startTime);
      const end = num(r.endTime);
      if (start === null || end === null || end <= start) continue;
      const stages = (r.stages || [])
        .filter((s) => s && num(s.startTime) !== null && num(s.endTime) !== null)
        .map((s) => ({ start: s.startTime, end: s.endTime, stage: num(s.stage) || 0 }));
      out.sleep.push({ start, end, stages, source: sourceOf(r), hcId: (r.metadata || {}).id || null });
    }
    return true;
  }
  if (recordType === 'ExerciseSessionRecord') {
    for (const r of records) {
      const start = num(r.startTime);
      const end = num(r.endTime);
      if (start === null || end === null) continue;
      out.exercise.push({
        uid: uidOf('exercise', r),
        exerciseType: num(r.exerciseType),
        title: typeof r.title === 'string' ? r.title.slice(0, 255) : null,
        notes: typeof r.notes === 'string' ? r.notes : null,
        start,
        end,
        source: sourceOf(r),
        lastModified: lastModOf(r),
      });
    }
    return true;
  }
  return false;
}

// whole payload -> normalized rows (+ unknown record types kept raw)
function parsePayload(payload) {
  const out = { samples: [], intervals: [], sleep: [], exercise: [], unknown: [] };
  // pH measurements from the separate app:
  //   { date: '2026-09-04', phValue: 5.7, time: '19:39:43', timestamp: 1788543583913 }
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.phValue === 'number') {
    let t = Number(payload.timestamp);
    if (!Number.isFinite(t) || t <= 0) t = NaN;
    out.ph = { time: t, value: payload.phValue, date: payload.date, clock: payload.time };
    return out;
  }
  if (!Array.isArray(payload)) return out;
  for (const item of payload) {
    if (!item || typeof item.record_type !== 'string') continue;
    const records = item.data && Array.isArray(item.data.records) ? item.data.records : [];
    if (!records.length) continue;
    if (!parseItem(item.record_type, records, out)) {
      for (const r of records) out.unknown.push({ recordType: item.record_type, record: r });
    }
  }
  return out;
}

const STAGE_NAMES = { 0: 'unknown', 1: 'awake', 2: 'sleeping', 3: 'out_of_bed', 4: 'light', 5: 'deep', 6: 'rem', 7: 'awake_in_bed' };

module.exports = { parsePayload, parseItem, SUPPORTED, STAGE_NAMES, uidOf };
