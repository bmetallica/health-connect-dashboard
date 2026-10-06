'use strict';

// Daily CSV export (German Excel: ";" separator, decimal comma, UTF-8 BOM).
// Base columns are always present, optional ones only if the range has data.

const T = require('./time');

function num(v, digits) {
  return v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(digits).replace('.', ',');
}
function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const COLUMNS = [
  { h: 'Datum', always: true, f: (d) => T.formatDE(d.day) },
  { h: 'Herzfrequenz Ø (bpm)', always: true, f: (d) => (d.hr ? num(d.hr.avg, 1) : '') },
  { h: 'Herzfrequenz min (bpm)', always: true, f: (d) => (d.hr ? d.hr.min : '') },
  { h: 'Herzfrequenz max (bpm)', always: true, f: (d) => (d.hr ? d.hr.max : '') },
  { h: 'Herzfrequenz Messwerte (Anzahl)', always: true, f: (d) => (d.hr ? d.hr.count : '') },
  { h: 'Ruhepuls gemessen (bpm)', has: (d) => d.resting && d.resting.measured, f: (d) => (d.resting && d.resting.measured ? num(d.resting.value, 0) : '') },
  { h: 'HRV Ø (ms)', has: (d) => d.hrv != null, f: (d) => num(d.hrv, 1) },
  { h: 'Schritte (Tagessumme)', always: true, f: (d) => (d.steps == null ? '' : Math.round(d.steps)) },
  { h: 'Distanz (km)', has: (d) => d.distance != null, f: (d) => num(d.distance, 2) },
  { h: 'Aktive Kalorien (kcal)', has: (d) => d.activeKcal != null, f: (d) => num(d.activeKcal, 0) },
  { h: 'Gesamtkalorien (kcal)', has: (d) => d.totalKcal != null, f: (d) => num(d.totalKcal, 0) },
  { h: 'Stockwerke', has: (d) => d.floors != null, f: (d) => num(d.floors, 0) },
  { h: 'Training (min)', has: (d) => d.exercise.length > 0, f: (d) => (d.exercise.length ? Math.round(d.exercise.reduce((a, e) => a + (e.end - e.start), 0) / 60000) : '') },
  { h: 'Schlafdauer gesamt (h)', always: true, f: (d) => (d.sleep ? num(d.sleep.totalMs / T.HOUR, 2) : '') },
  { h: 'SpO₂ Ø (%)', always: true, f: (d) => (d.spo2 ? num(d.spo2.avg, 1) : '') },
  { h: 'Atemfrequenz Ø (/min)', has: (d) => d.respRate != null, f: (d) => num(d.respRate, 1) },
  { h: 'Körpertemperatur Ø (°C)', has: (d) => d.temp != null, f: (d) => num(d.temp, 1) },
  { h: 'Blutdruck systolisch Ø (mmHg)', has: (d) => d.bp != null, f: (d) => (d.bp ? num(d.bp.sys, 0) : '') },
  { h: 'Blutdruck diastolisch Ø (mmHg)', has: (d) => d.bp != null, f: (d) => (d.bp ? num(d.bp.dia, 0) : '') },
  { h: 'Blutzucker Ø (mg/dl)', has: (d) => d.glucose != null, f: (d) => num(d.glucose, 0) },
  { h: 'pH-Wert Ø', always: true, f: (d) => num(d.phAvg, 2) },
  {
    h: 'pH-Werte (Eingangszeit)',
    always: true,
    f: (d) => d.ph.map((x) => `${num(x.value, 1)} (${T.timeHM(x.receivedAt || x.time)})`).join(' / '),
  },
  { h: 'Gewicht Ø (kg)', has: (d) => d.weight != null, f: (d) => num(d.weight, 1) },
  { h: 'BMI', has: (d) => d.bmi != null, f: (d) => num(d.bmi, 1) },
  { h: 'Körperfett Ø (%)', has: (d) => d.bodyFat != null, f: (d) => num(d.bodyFat, 1) },
  { h: 'VO₂max', has: (d) => d.vo2max != null, f: (d) => num(d.vo2max, 1) },
  { h: 'Trinkmenge (l)', has: (d) => d.hydration != null, f: (d) => num(d.hydration, 2) },
  { h: 'Notiz', always: true, f: (d) => d.note || '' },
  { h: 'Tags', always: true, f: (d) => d.tags.map((t) => t.name).join(', ') },
];

function buildCsv(days) {
  const cols = COLUMNS.filter((c) => c.always || days.some(c.has));
  const rows = [cols.map((c) => c.h)];
  for (const d of days) rows.push(cols.map((c) => c.f(d)));
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

module.exports = { buildCsv };
