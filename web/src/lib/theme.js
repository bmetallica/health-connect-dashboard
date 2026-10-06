// one accent color per measurement, used identically everywhere
export const COLORS = {
  hr: '#fb7185',
  resting: '#e11d48',
  hrv: '#f472b6',
  sleep: '#a78bfa',
  deep: '#6d28d9',
  light: '#a78bfa',
  rem: '#38bdf8',
  awake: '#fbbf24',
  steps: '#4ade80',
  activity: '#4ade80',
  distance: '#2dd4bf',
  kcal: '#fb923c',
  spo2: '#22d3ee',
  resp: '#60a5fa',
  temp: '#f87171',
  bp: '#e879f9',
  ph: '#facc15',
  weight: '#fb923c',
  body: '#fb923c',
  journal: '#94a3b8',
  accent: '#22d3ee',
};

export const STATUS = {
  ok: { color: '#34d399', icon: '✓', label: 'gut' },
  warn: { color: '#fbbf24', icon: '!', label: 'mittel' },
  crit: { color: '#f87171', icon: '✕', label: 'kritisch' },
};

export const STAGES = {
  deep: { label: 'Tiefschlaf', color: '#6d28d9', order: 0 },
  light: { label: 'Leichtschlaf', color: '#a78bfa', order: 1 },
  sleeping: { label: 'Schlaf', color: '#8b5cf6', order: 1 },
  rem: { label: 'REM', color: '#38bdf8', order: 2 },
  awake: { label: 'Wach', color: '#fbbf24', order: 3 },
  awake_in_bed: { label: 'Wach im Bett', color: '#f59e0b', order: 3 },
  out_of_bed: { label: 'Außerhalb Bett', color: '#64748b', order: 4 },
  unknown: { label: 'Unbekannt', color: '#475569', order: 5 },
};

// hex -> rgba with alpha
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const EXERCISE_TYPES = {
  2: 'Badminton', 4: 'Baseball', 5: 'Basketball', 8: 'Radfahren', 9: 'Radfahren (stationär)', 10: 'Bootcamp', 11: 'Boxen',
  13: 'Calisthenics', 14: 'Cricket', 16: 'Tanzen', 25: 'Ellipsentrainer', 26: 'Fitnesskurs', 27: 'Fechten', 28: 'Football',
  29: 'Football (AU)', 31: 'Frisbee', 32: 'Golf', 33: 'Geführte Atmung', 34: 'Turnen', 35: 'Handball', 36: 'HIIT',
  37: 'Wandern', 38: 'Eishockey', 39: 'Eislaufen', 44: 'Kampfsport', 46: 'Paddeln', 47: 'Paragliding', 48: 'Pilates',
  50: 'Racquetball', 51: 'Klettern', 52: 'Rollhockey', 53: 'Rudern', 54: 'Rudergerät', 55: 'Rugby', 56: 'Laufen',
  57: 'Laufband', 58: 'Segeln', 59: 'Tauchen', 60: 'Skaten', 61: 'Skifahren', 62: 'Snowboarden', 63: 'Schneeschuhwandern',
  64: 'Fußball', 65: 'Softball', 66: 'Squash', 68: 'Treppensteigen', 69: 'Treppensteiger', 70: 'Krafttraining',
  71: 'Dehnen', 72: 'Surfen', 73: 'Schwimmen (Freiwasser)', 74: 'Schwimmen (Becken)', 75: 'Tischtennis', 76: 'Tennis',
  78: 'Volleyball', 79: 'Gehen', 80: 'Wasserball', 81: 'Gewichtheben', 82: 'Rollstuhl', 83: 'Yoga', 0: 'Training',
};
