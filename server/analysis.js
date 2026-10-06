'use strict';

// Correlations between day values and tag effects, with plain-language text.

const T = require('./time');

const METRICS = {
  ph: { subj: 'dein pH-Wert', label: 'pH-Wert', unit: '', digits: 2, get: (d) => d.phAvg },
  sleep: { subj: 'deine Schlafdauer', label: 'Schlafdauer', unit: ' h', digits: 1, get: (d) => (d.sleep ? d.sleep.totalMs / T.HOUR : null) },
  steps: { subj: 'deine Schrittzahl', label: 'Schritte', unit: '', digits: 0, get: (d) => (d.steps > 0 ? d.steps : null) },
  resting: { subj: 'dein Ruhepuls', label: 'Ruhepuls', unit: ' bpm', digits: 0, get: (d) => (d.resting ? d.resting.value : null) },
  hr: { subj: 'dein Ø Puls', label: 'Ø Puls', unit: ' bpm', digits: 0, get: (d) => (d.hr ? d.hr.avg : null) },
  spo2: { subj: 'deine Sauerstoffsättigung', label: 'SpO₂', unit: ' %', digits: 1, get: (d) => (d.spo2 ? d.spo2.avg : null) },
  hrv: { subj: 'deine HRV', label: 'HRV', unit: ' ms', digits: 0, get: (d) => d.hrv },
  weight: { subj: 'dein Gewicht', label: 'Gewicht', unit: ' kg', digits: 1, get: (d) => d.weight },
  kcal: { subj: 'dein Kalorienverbrauch', label: 'Aktive Kalorien', unit: ' kcal', digits: 0, get: (d) => d.activeKcal },
};

// [y, x, lag in days (x taken from day - lag), label of the x side, phrase for "more x"]
const PAIRS = [
  ['ph', 'sleep', 0, 'Schlaf der Nacht davor', 'mehr Schlaf in der Nacht davor'],
  ['ph', 'steps', 1, 'Schritte am Vortag', 'mehr Schritten am Vortag'],
  ['ph', 'steps', 0, 'Schritte am selben Tag', 'mehr Schritten am selben Tag'],
  ['ph', 'resting', 0, 'Ruhepuls am selben Tag', 'höherem Ruhepuls'],
  ['ph', 'hr', 1, 'Ø Puls am Vortag', 'höherem Ø Puls am Vortag'],
  ['ph', 'weight', 0, 'Gewicht', 'höherem Gewicht'],
  ['resting', 'sleep', 0, 'Schlaf der Nacht davor', 'mehr Schlaf in der Nacht davor'],
  ['resting', 'steps', 1, 'Schritte am Vortag', 'mehr Schritten am Vortag'],
  ['sleep', 'steps', 1, 'Schritte am Vortag', 'mehr Schritten am Vortag'],
  ['sleep', 'kcal', 1, 'aktive Kalorien am Vortag', 'mehr aktiven Kalorien am Vortag'],
  ['hrv', 'sleep', 0, 'Schlaf der Nacht davor', 'mehr Schlaf in der Nacht davor'],
  ['hrv', 'steps', 1, 'Schritte am Vortag', 'mehr Schritten am Vortag'],
  ['spo2', 'sleep', 0, 'Schlaf der Nacht davor', 'mehr Schlaf in der Nacht davor'],
  ['hr', 'steps', 0, 'Schritte am selben Tag', 'mehr Schritten am selben Tag'],
];

const MIN_N = 14;

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function strength(r) {
  const a = Math.abs(r);
  return a < 0.1 ? 'kein' : a < 0.3 ? 'schwach' : a < 0.5 ? 'mäßig' : 'stark';
}

const fmt = (v, digits) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function correlations(days) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const findings = [];
  for (const [yk, xk, lag, xDesc, phrase] of PAIRS) {
    const Y = METRICS[yk];
    const X = METRICS[xk];
    const points = [];
    for (const d of days) {
      const xd = byDay.get(T.addDays(d.day, -lag));
      if (!xd) continue;
      const y = Y.get(d);
      const x = X.get(xd);
      if (y != null && x != null && Number.isFinite(x) && Number.isFinite(y)) points.push({ day: d.day, x, y });
    }
    if (points.length < 5) continue;
    const r = pearson(points.map((p) => p.x), points.map((p) => p.y));
    if (r === null) continue;
    // median split: average y when x is above vs. below its median
    const xsSorted = points.map((p) => p.x).sort((a, b) => a - b);
    const med = xsSorted[Math.floor(xsSorted.length / 2)];
    const hi = points.filter((p) => p.x >= med).map((p) => p.y);
    const lo = points.filter((p) => p.x < med).map((p) => p.y);
    let text;
    const reliable = points.length >= MIN_N;
    if (hi.length && lo.length) {
      const diff = mean(hi) - mean(lo);
      if (fmt(Math.abs(diff), Y.digits) === fmt(0, Y.digits)) text = `Bei ${phrase} zeigt sich kein nennenswerter Unterschied beim Wert „${Y.label}“.`;
      else text = `Bei ${phrase} (ab ${fmt(med, X.digits)}${X.unit}) liegt ${Y.subj} im Schnitt ${diff >= 0 ? 'um ' + fmt(Math.abs(diff), Y.digits) + Y.unit + ' höher' : 'um ' + fmt(Math.abs(diff), Y.digits) + Y.unit + ' niedriger'} (${fmt(mean(hi), Y.digits)} statt ${fmt(mean(lo), Y.digits)}${Y.unit}).`;
    }
    findings.push({
      kind: 'correlation',
      y: yk,
      x: xk,
      lag,
      yLabel: Y.label,
      xLabel: xDesc,
      r,
      n: points.length,
      strength: strength(r),
      direction: r >= 0 ? 'positiv' : 'negativ',
      reliable,
      text,
      hint: reliable ? null : `Nur ${points.length} gemeinsame Tage – für eine belastbare Aussage werden mindestens ${MIN_N} benötigt.`,
      points,
    });
  }
  findings.sort((a, b) => (b.reliable - a.reliable) || Math.abs(b.r) - Math.abs(a.r));
  return findings;
}

// average of a metric on days with a tag vs. without (same day and next day)
function tagEffects(days) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const tags = new Map();
  for (const d of days) for (const t of d.tags) tags.set(t.name, t);
  const out = [];
  for (const [name, tag] of tags) {
    for (const mk of ['ph', 'sleep', 'resting', 'steps', 'hrv']) {
      const M = METRICS[mk];
      for (const lag of [0, 1]) {
        const withTag = [];
        const without = [];
        for (const d of days) {
          const src = byDay.get(T.addDays(d.day, -lag));
          if (!src) continue;
          const v = M.get(d);
          if (v == null) continue;
          (src.tags.some((t) => t.name === name) ? withTag : without).push(v);
        }
        if (withTag.length < 2 || without.length < 3) continue;
        const diff = mean(withTag) - mean(without);
        const rel = Math.abs(diff) / (Math.abs(mean(without)) || 1);
        if (rel < 0.02) continue; // negligible
        out.push({
          kind: 'tag',
          tag: name,
          color: tag.color,
          metric: mk,
          lag,
          withN: withTag.length,
          withoutN: without.length,
          withAvg: mean(withTag),
          withoutAvg: mean(without),
          diff,
          reliable: withTag.length >= 4 && without.length >= 7,
          text: `${lag ? 'Am Tag nach' : 'An Tagen mit'} „${name}“ liegt ${M.subj} im Schnitt ${diff >= 0 ? 'um ' + fmt(Math.abs(diff), M.digits) + M.unit + ' höher' : 'um ' + fmt(Math.abs(diff), M.digits) + M.unit + ' niedriger'} (${fmt(mean(withTag), M.digits)} statt ${fmt(mean(without), M.digits)}${M.unit}, ${withTag.length} Tage).`,
        });
      }
    }
  }
  out.sort((a, b) => (b.reliable - a.reliable) || Math.abs(b.diff / (b.withoutAvg || 1)) - Math.abs(a.diff / (a.withoutAvg || 1)));
  return out;
}

module.exports = { correlations, tagEffects, METRICS, MIN_N };
