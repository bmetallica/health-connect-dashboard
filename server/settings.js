'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DAY = 86400000;

const DEFAULT_SOURCES = {
  // the band (Huawei Health via Health Sync) first, phone sources as fallback
  priority: ['nl.appyhapps.healthsync', 'com.huawei.health', 'com.sec.android.app.shealth', 'com.google.android.apps.fitness', 'android'],
  mode: 'priority', // or 'max'
};

const TRAINING_GOALS = {
  normal: { mult: 1.2, def: 10000, lo: 8000, hi: 12000 },
  abnehmen: { mult: 1.5, def: 12000, lo: 10000, hi: 15000 },
  stark_abnehmen: { mult: 2.0, def: 15000, lo: 12000, hi: 18000 },
};

let profileCache = null;

// latest effective weight measurement (weight history replaces the static profile value)
async function latestWeight() {
  const rows = await db.query(
    `SELECT COALESCE(edit_value, value) AS v, COALESCE(edit_time, time) AS t FROM samples
     WHERE type = 'weight' AND deleted = 0 ORDER BY COALESCE(edit_time, time) DESC LIMIT 1`
  );
  return rows.length ? { value: rows[0].v, time: Number(rows[0].t) } : null;
}

async function getProfile() {
  if (!profileCache) profileCache = (await db.getSetting('profile')) || {};
  const p = { ...profileCache };
  const w = await latestWeight();
  if (w) {
    p.weightKg = Math.round(w.value * 10) / 10;
    p.weightFrom = w.time;
  }
  return p;
}

async function saveProfile(p) {
  await db.setSetting('profile', p);
  profileCache = p;
}

// one-time: data/profile.json -> settings table
async function migrateProfileFile(log) {
  if (await db.getSetting('profile')) return;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'profile.json'), 'utf8'));
    await saveProfile(p);
    log('[settings] profile.json imported');
    // seed the weight history with the profile weight
    if (p.weightKg && !(await latestWeight())) {
      const t = Date.parse(p.updatedAt) || Date.now();
      await db.query("INSERT IGNORE INTO samples (type, time, value, source, received_at, manual) VALUES ('weight', ?, ?, 'profil', ?, 1)", [t, p.weightKg, t]);
    }
  } catch {
    // no old profile
  }
}

async function getSourceSettings() {
  const s = await db.getSetting('sources');
  return { ...DEFAULT_SOURCES, ...(s || {}) };
}

function ageOf(profile) {
  if (!profile || !profile.birthDate) return null;
  const b = Date.parse(profile.birthDate + 'T00:00:00');
  if (isNaN(b)) return null;
  const age = (Date.now() - b) / (365.25 * DAY);
  return age > 0 && age < 120 ? Math.floor(age) : null;
}

// resting heart rate reference bands (bpm) by age group and sex
function restingRef(profile) {
  if (!profile || !profile.birthDate || !profile.sex) return null;
  const age = ageOf(profile);
  if (age === null) return null;
  let band;
  if (age < 40) band = { male: [55, 75], female: [58, 78] };
  else if (age < 60) band = { male: [58, 78], female: [60, 80] };
  else band = { male: [60, 80], female: [62, 82] };
  const [okLo, okHi] = band[profile.sex];
  return { okLo, okHi, warnLo: okLo - 5, warnHi: okHi + 5 };
}

function bmiStatus(bmi) {
  return bmi == null ? null : bmi < 18.5 ? 'Untergewicht' : bmi < 25 ? 'Normalgewicht' : bmi < 30 ? 'Übergewicht' : 'Adipositas';
}

function stepGoalSuggestion(trainingGoal, avgPerDay) {
  const cfg = TRAINING_GOALS[trainingGoal];
  if (!cfg) return null;
  const raw = (avgPerDay > 0 ? avgPerDay : cfg.def) * cfg.mult;
  return Math.round(Math.min(cfg.hi, Math.max(cfg.lo, raw)) / 500) * 500;
}

function derive(p, recentStepsAvg) {
  const age = ageOf(p);
  const bmi = p.heightCm && p.weightKg ? Math.round((p.weightKg / Math.pow(p.heightCm / 100, 2)) * 10) / 10 : null;
  const out = { age, bmi, bmiStatus: bmiStatus(bmi), maxHr: age !== null ? 220 - age : null, restingRef: restingRef(p) };
  let goal = p.stepGoal || 10000;
  if (p.trainingGoal && p.trainingGoal !== 'aus') {
    const s = stepGoalSuggestion(p.trainingGoal, recentStepsAvg);
    if (s) goal = s;
    out.stepGoalBasis = recentStepsAvg || null;
  }
  out.stepGoal = goal;
  const phMin = typeof p.phTargetMin === 'number' ? p.phTargetMin : null;
  const phMax = typeof p.phTargetMax === 'number' ? p.phTargetMax : null;
  out.phTarget = phMin != null && phMax != null ? { min: phMin, max: phMax } : null;
  return out;
}

module.exports = {
  getProfile, saveProfile, migrateProfileFile, getSourceSettings, DEFAULT_SOURCES, TRAINING_GOALS, ageOf, restingRef, derive, latestWeight, bmiStatus,
};
