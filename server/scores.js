'use strict';

// 0-100 scores (ported from the previous version, now based on day values)

const T = require('./time');
const { restingRef, ageOf } = require('./settings');

const PH_TOL_OK = 0.2;
const PH_TOL_WARN = 0.5;

function statusOf(score) {
  return score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'crit';
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const coverageFactor = (cov) => 0.5 + 0.5 * Math.min(1, Math.max(0, cov));

// duration 40 %, deep 20 %, REM 20 %, awake 20 %; target 7-9 h (65+: 7-8 h)
function sleepScore(stageAgg, durationMs, profile) {
  const total = durationMs || 1;
  const h = total / T.HOUR;
  const age = ageOf(profile);
  const durHi = age !== null && age >= 65 ? 8 : 9;
  let durScore;
  if (h >= 7 && h <= durHi) durScore = 100;
  else if (h > durHi) durScore = Math.max(40, 100 - (h - durHi) * 25);
  else durScore = h >= 6 ? 75 : h >= 5 ? 50 : 25;
  const hasStages = Object.keys(stageAgg).some((k) => ['deep', 'rem', 'light'].includes(k));
  const deepPct = ((stageAgg.deep || 0) / total) * 100;
  const remPct = ((stageAgg.rem || 0) / total) * 100;
  const awakePct = (((stageAgg.awake || 0) + (stageAgg.awake_in_bed || 0)) / total) * 100;
  const deepScore = Math.max(0, 100 - Math.abs(deepPct - 18) * 5);
  const remScore = Math.max(0, 100 - Math.abs(remPct - 22) * 4);
  const awakeScore = Math.max(0, 100 - Math.max(0, awakePct - 10) * 3);
  const totalScore = hasStages ? Math.round(0.4 * durScore + 0.2 * deepScore + 0.2 * remScore + 0.2 * awakeScore) : Math.round(durScore);
  const breakdown = [{ label: 'Dauer', value: h.toFixed(1).replace('.', ',') + ' h', ref: '7–' + durHi + ' h', score: Math.round(durScore) }];
  if (hasStages) {
    breakdown.push(
      { label: 'Tiefschlaf', value: deepPct.toFixed(0) + ' %', ref: '~18 %', score: Math.round(deepScore) },
      { label: 'REM', value: remPct.toFixed(0) + ' %', ref: '~22 %', score: Math.round(remScore) },
      { label: 'Wach', value: awakePct.toFixed(0) + ' %', ref: '≤ 10 %', score: Math.round(awakeScore) }
    );
  }
  for (const b of breakdown) b.status = statusOf(b.score);
  return { total: totalScore, status: statusOf(totalScore), breakdown };
}

function sleepSummary(days, profile) {
  const nights = days.filter((d) => d.sleep);
  if (!nights.length) return null;
  const qualities = nights.map((d) => sleepScore(d.sleep.stages, d.sleep.mainDurationMs, profile).total);
  const base = Math.round(avg(qualities));
  const cov = Math.min(1, nights.length / days.length);
  const total = Math.round(base * coverageFactor(cov));
  return {
    total,
    status: statusOf(total),
    avgHours: avg(nights.map((d) => d.sleep.totalMs / T.HOUR)),
    nights: nights.length,
    expected: days.length,
    breakdown: [
      { label: 'Ø Qualität', value: nights.length + ' Nächte', ref: '–', score: base, status: statusOf(base) },
      { label: 'Datendeckung', value: nights.length + '/' + days.length, ref: '100 %', score: Math.round(cov * 100), status: statusOf(cov * 100) },
    ],
  };
}

function restingSummary(days, profile) {
  const vals = days.filter((d) => d.resting).map((d) => d.resting.value);
  if (!vals.length) return null;
  const resting = Math.round(avg(vals));
  const ref = restingRef(profile);
  const okLo = ref ? ref.okLo : 60;
  const okHi = ref ? ref.okHi : 100;
  const warnLo = ref ? ref.warnLo : 55;
  const warnHi = ref ? ref.warnHi : 105;
  // a low resting heart rate is not a warning sign by itself (fitness, values
  // measured during sleep); only very low values are flagged
  const status = resting <= okHi && resting >= 40 ? 'ok' : (resting > okHi && resting <= warnHi) || (resting >= 35 && resting < 40) ? 'warn' : 'crit';
  const total = status === 'ok' ? 100 : status === 'warn' ? 70 : 40;
  return { total, status, resting, ref: { okLo, okHi, warnLo, warnHi }, personal: !!ref, days: vals.length };
}

// 70 % goal achievement (avg of last 7 recorded days), 30 % streak, scaled by coverage
function stepsSummary(days, goal) {
  const rec = days.filter((d) => d.steps != null && d.steps > 0);
  if (!rec.length) return null;
  const last7 = rec.slice(-7);
  const avg7 = Math.round(avg(last7.map((d) => d.steps)));
  let best = rec[0];
  for (const d of rec) if (d.steps > best.steps) best = d;
  // consecutive days with goal met, back from the newest recorded day
  let streak = 0;
  for (let i = rec.length - 1; i >= 0; i--) {
    if (rec[i].steps < goal) break;
    if (i < rec.length - 1 && T.daysBetween(rec[i].day, rec[i + 1].day) !== 1) break;
    streak++;
  }
  const achievement = goal ? Math.min(100, (avg7 / goal) * 100) : 0;
  const consistency = Math.min(100, (streak / 7) * 100);
  const base = 0.7 * achievement + 0.3 * consistency;
  const total = Math.round(base * coverageFactor(rec.length / days.length));
  return {
    total,
    status: statusOf(total),
    goal,
    avg7,
    avg: Math.round(avg(rec.map((d) => d.steps))),
    best: { day: best.day, steps: best.steps },
    streak,
    goalDays: rec.filter((d) => d.steps >= goal).length,
    recorded: rec.length,
    expected: days.length,
    breakdown: [
      { label: 'Zielerreichung', value: avg7.toLocaleString('de-DE') + ' Ø', ref: goal.toLocaleString('de-DE'), score: Math.round(achievement), status: statusOf(achievement) },
      { label: 'Serie', value: streak + ' Tage', ref: '7 Tage', score: Math.round(consistency), status: statusOf(consistency) },
    ],
  };
}

function spo2Summary(samples) {
  if (samples.length < 5) return null;
  const vals = samples.map((s) => s.value);
  const min = Math.min(...vals);
  const below = vals.filter((v) => v < 95).length;
  const pctBelow95 = Math.round((below / vals.length) * 100);
  let score = min >= 95 ? 100 : min >= 93 ? 80 : min >= 90 ? 55 : 25;
  score = Math.max(0, Math.min(100, score - Math.round(pctBelow95 / 5)));
  return { total: score, status: statusOf(score), min, avg: avg(vals), pctBelow95, count: vals.length };
}

function phDeviation(v, target) {
  if (!target) return null;
  return v < target.min ? v - target.min : v > target.max ? v - target.max : 0;
}
function phStatus(v, target) {
  if (!target) return null;
  const d = Math.abs(phDeviation(v, target));
  return d <= PH_TOL_OK ? 'ok' : d <= PH_TOL_WARN ? 'warn' : 'crit';
}

function phSummary(samples, target) {
  const n = samples.length;
  if (!n) return null;
  const vals = samples.map((s) => s.value);
  const sorted = vals.slice().sort((a, b) => a - b);
  const latest = samples[n - 1];
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const within = target ? samples.filter((s) => Math.abs(phDeviation(s.value, target)) <= PH_TOL_OK).length : null;
  const out = {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    avg: avg(vals),
    median,
    latest: { time: latest.time, value: latest.value, deviation: phDeviation(latest.value, target), status: phStatus(latest.value, target) },
    target,
    pctWithin: target ? Math.round((within / n) * 100) : null,
    total: null,
    status: null,
  };
  if (target && n >= 3) {
    const closeness = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.abs(phDeviation(latest.value, target))))));
    const total = Math.round(0.5 * closeness + 0.5 * out.pctWithin);
    out.total = total;
    out.status = statusOf(total);
    out.breakdown = [
      { label: 'Letzte Messung', value: String(latest.value).replace('.', ','), ref: `${target.min}–${target.max}`.replace(/\./g, ','), score: closeness, status: statusOf(closeness) },
      { label: 'Im Zielbereich', value: out.pctWithin + ' %', ref: `±${PH_TOL_OK}`.replace('.', ','), score: out.pctWithin, status: statusOf(out.pctWithin) },
    ];
  }
  return out;
}

// heart rate zones relative to the max heart rate (220 - age), fallback fixed bands
function hrZones(maxHr) {
  if (!maxHr) {
    return [
      { key: 'z1', label: 'Ruhe', min: 0, max: 100 },
      { key: 'z2', label: 'Leicht', min: 100, max: 120 },
      { key: 'z3', label: 'Mittel', min: 120, max: 140 },
      { key: 'z4', label: 'Hoch', min: 140, max: 160 },
      { key: 'z5', label: 'Maximal', min: 160, max: 300 },
    ];
  }
  const b = (p) => Math.round(maxHr * p);
  return [
    { key: 'z1', label: 'Ruhe', min: 0, max: b(0.5) },
    { key: 'z2', label: 'Leicht', min: b(0.5), max: b(0.6) },
    { key: 'z3', label: 'Fettverbrennung', min: b(0.6), max: b(0.7) },
    { key: 'z4', label: 'Ausdauer', min: b(0.7), max: b(0.85) },
    { key: 'z5', label: 'Maximal', min: b(0.85), max: 300 },
  ];
}

function overall(parts) {
  const vals = parts.filter((p) => p && typeof p.total === 'number').map((p) => p.total);
  if (!vals.length) return null;
  const total = Math.round(avg(vals));
  return { total, status: statusOf(total), parts: vals.length };
}

module.exports = {
  statusOf, sleepScore, sleepSummary, restingSummary, stepsSummary, spo2Summary, phSummary, phDeviation, phStatus, hrZones, overall, PH_TOL_OK, PH_TOL_WARN,
};
