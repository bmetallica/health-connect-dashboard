'use strict';

// PDF report (pdfkit, vector charts drawn directly; light layout for printing)

const PDFDocument = require('pdfkit');
const T = require('./time');
const S = require('./scores');

const C = {
  text: '#1e293b', muted: '#64748b', grid: '#e2e8f0', accent: '#0ea5e9',
  hr: '#e11d48', resting: '#9f1239', steps: '#16a34a', sleep: '#7c3aed', spo2: '#0891b2', ph: '#ca8a04', weight: '#ea580c',
  ok: '#16a34a', warn: '#d97706', crit: '#dc2626',
};
const M = 48; // page margin
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const statusLabel = { ok: 'gut', warn: 'mittel', crit: 'kritisch' };
// the standard PDF fonts cannot render subscript digits
const pdfText = (s) => String(s).replace(/₂/g, '2');

function buildReport(stream, data) {
  const { from, to, summary, days, derived, profile, ph, analysis } = data;
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Gesundheitsbericht ${from} – ${to}` } });
  doc.pipe(stream);
  const W = doc.page.width - 2 * M;

  const ensure = (h) => {
    if (doc.y + h > doc.page.height - M - 20) doc.addPage();
  };
  const heading = (t) => {
    ensure(40);
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor(C.text).text(pdfText(t), M, doc.y);
    doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).lineWidth(0.5).strokeColor(C.grid).stroke();
    doc.moveDown(0.5);
  };

  // ---------- title ----------
  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.text).text('Gesundheitsbericht', M, M);
  doc.font('Helvetica').fontSize(11).fillColor(C.muted).text(`Zeitraum: ${T.formatDE(from)} – ${T.formatDE(to)}  ·  erstellt am ${T.formatDE(T.today())}`);
  doc.moveDown(0.6);
  const facts = [];
  if (profile.name) facts.push(profile.name);
  if (derived.age != null) facts.push(`${derived.age} Jahre`);
  if (profile.sex) facts.push(profile.sex === 'male' ? 'männlich' : 'weiblich');
  if (profile.heightCm) facts.push(`${profile.heightCm} cm`);
  if (profile.weightKg) facts.push(`${fmt(profile.weightKg, 1)} kg`);
  if (derived.bmi) facts.push(`BMI ${fmt(derived.bmi, 1)} (${derived.bmiStatus})`);
  if (facts.length) doc.fontSize(10).fillColor(C.text).text(facts.join('  ·  '));

  // overall score
  if (summary.overall) {
    const y = doc.y + 12;
    const col = C[summary.overall.status];
    doc.roundedRect(M, y, W, 46, 6).fillColor('#f8fafc').fill();
    doc.circle(M + 26, y + 23, 15).lineWidth(3).strokeColor(col).stroke();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(col).text(String(summary.overall.total), M + 11, y + 17, { width: 30, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text).text('Gesamtbewertung', M + 52, y + 10);
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`Durchschnitt aus ${summary.overall.parts} Bereichen (Schlaf, Ruhepuls, Aktivität, SpO2, pH) – ${statusLabel[summary.overall.status]}`, M + 52, y + 25);
    doc.y = y + 56;
  }

  // ---------- overview table ----------
  heading('Übersicht');
  const avgOf = (f) => {
    const v = days.map(f).filter((x) => x != null && Number.isFinite(x));
    return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v), n: v.length } : null;
  };
  const rows = [
    ['Herzfrequenz Ø (bpm)', avgOf((d) => d.hr && d.hr.avg), 0, null],
    ['Ruhepuls (bpm)', avgOf((d) => d.resting && d.resting.value), 0, summary.resting],
    ['Schritte pro Tag', avgOf((d) => (d.steps > 0 ? d.steps : null)), 0, summary.steps],
    ['Schlaf pro Nacht (h)', avgOf((d) => d.sleep && d.sleep.totalMs / T.HOUR), 1, summary.sleep],
    ['SpO2 Ø (%)', avgOf((d) => d.spo2 && d.spo2.avg), 1, summary.spo2],
    ['pH-Wert', avgOf((d) => d.phAvg), 2, summary.ph],
    ['Gewicht (kg)', avgOf((d) => d.weight), 1, null],
    ['HRV (ms)', avgOf((d) => d.hrv), 0, null],
  ].filter((r) => r[1]);
  const cols = [M, M + 190, M + 260, M + 330, M + 400, M + 450];
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted);
  ['Messgröße', 'Ø', 'Min', 'Max', 'Tage', 'Bewertung'].forEach((h, i) => doc.text(h, cols[i], doc.y, { continued: false, lineBreak: false }));
  doc.moveDown(1);
  for (const [label, st, d, score] of rows) {
    ensure(18);
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(C.text);
    doc.text(label, cols[0], y, { lineBreak: false });
    doc.text(fmt(st.avg, d), cols[1], y, { lineBreak: false });
    doc.text(fmt(st.min, d), cols[2], y, { lineBreak: false });
    doc.text(fmt(st.max, d), cols[3], y, { lineBreak: false });
    doc.text(String(st.n), cols[4], y, { lineBreak: false });
    if (score && score.total != null) {
      doc.fillColor(C[score.status]).font('Helvetica-Bold').text(`${score.total} (${statusLabel[score.status]})`, cols[5], y, { lineBreak: false });
    } else doc.fillColor(C.muted).text('–', cols[5], y, { lineBreak: false });
    doc.y = y + 16;
  }

  // ---------- charts ----------
  const chart = (title, series, opts = {}) => {
    const vals = series.flatMap((s) => s.values).filter((v) => v != null);
    if (!vals.length) return;
    const H = 130;
    ensure(H + 40);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text).text(pdfText(title), M, doc.y + 6);
    const top = doc.y + 6;
    const left = M + 34;
    const width = W - 34;
    let lo = Math.min(...vals, ...(opts.band ? [opts.band.lo] : []), ...(opts.ref != null ? [opts.ref] : []));
    let hi = Math.max(...vals, ...(opts.band ? [opts.band.hi] : []), ...(opts.ref != null ? [opts.ref] : []));
    if (opts.zero) lo = 0;
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    lo = opts.zero ? 0 : lo - pad;
    hi += pad;
    const n = days.length;
    const xOf = (i) => left + (n === 1 ? width / 2 : (i / (n - 1)) * width);
    const yOf = (v) => top + H - ((v - lo) / (hi - lo)) * H;
    // grid + y labels
    doc.font('Helvetica').fontSize(7).fillColor(C.muted);
    for (let g = 0; g <= 4; g++) {
      const v = lo + ((hi - lo) * g) / 4;
      const y = yOf(v);
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.4).strokeColor(C.grid).stroke();
      doc.text(fmt(v, opts.digits ?? 0), M, y - 3, { width: 30, align: 'right' });
    }
    if (opts.band) {
      doc.rect(left, yOf(opts.band.hi), width, yOf(opts.band.lo) - yOf(opts.band.hi)).fillOpacity(0.12).fill(opts.band.color).fillOpacity(1);
    }
    doc.fillColor(C.muted);
    if (opts.ref != null) {
      doc.moveTo(left, yOf(opts.ref)).lineTo(left + width, yOf(opts.ref)).dash(3, { space: 3 }).lineWidth(0.8).strokeColor(C.muted).stroke().undash();
    }
    // x labels (about 6)
    const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) doc.text(T.formatDE(days[i].day).slice(0, 6), xOf(i) - 15, top + H + 4, { width: 30, align: 'center' });
    for (const s of series) {
      if (s.type === 'bar') {
        const bw = Math.max(1.5, (width / n) * 0.65);
        s.values.forEach((v, i) => {
          if (v == null) return;
          doc.rect(xOf(i) - bw / 2, yOf(v), bw, yOf(lo) - yOf(v)).fill(s.color);
        });
      } else {
        let started = false;
        s.values.forEach((v, i) => {
          if (v == null) { started = false; return; }
          if (!started) { doc.moveTo(xOf(i), yOf(v)); started = true; } else doc.lineTo(xOf(i), yOf(v));
        });
        doc.lineWidth(1.4).strokeColor(s.color).stroke();
        s.values.forEach((v, i) => { if (v != null) doc.circle(xOf(i), yOf(v), 1.6).fill(s.color); });
      }
    }
    // legend
    let lx = left;
    const ly = top + H + 16;
    for (const s of series) {
      doc.rect(lx, ly + 1, 8, 6).fill(s.color);
      doc.fillColor(C.muted).fontSize(7.5).text(pdfText(s.label), lx + 11, ly, { lineBreak: false });
      lx += 16 + doc.widthOfString(pdfText(s.label));
    }
    doc.y = ly + 14;
  };

  heading('Verläufe');
  chart('Herzfrequenz (bpm)', [
    { label: 'Ø Puls', color: C.hr, values: days.map((d) => (d.hr ? d.hr.avg : null)) },
    { label: 'Ruhepuls', color: C.resting, values: days.map((d) => (d.resting ? d.resting.value : null)) },
  ]);
  chart('Schritte pro Tag', [{ label: 'Schritte', color: C.steps, type: 'bar', values: days.map((d) => (d.steps > 0 ? d.steps : null)) }], { zero: true, ref: derived.stepGoal });
  chart('Schlaf pro Nacht (h)', [{ label: 'Schlafdauer', color: C.sleep, type: 'bar', values: days.map((d) => (d.sleep ? d.sleep.totalMs / T.HOUR : null)) }], { zero: true, digits: 1, band: { lo: 7, hi: 9, color: C.sleep } });
  chart('SpO2 (%)', [{ label: 'Ø SpO2', color: C.spo2, values: days.map((d) => (d.spo2 ? d.spo2.avg : null)) }], { digits: 1 });
  chart('pH-Wert', [{ label: 'Ø pH pro Tag', color: C.ph, values: days.map((d) => d.phAvg) }], {
    digits: 1, band: derived.phTarget ? { lo: derived.phTarget.min, hi: derived.phTarget.max, color: C.ok } : null,
  });
  chart('Gewicht (kg)', [{ label: 'Gewicht', color: C.weight, values: days.map((d) => d.weight) }], { digits: 1 });
  chart('HRV (ms)', [{ label: 'HRV', color: C.accent, values: days.map((d) => d.hrv) }]);

  // ---------- pH table ----------
  if (ph.length) {
    heading(`pH-Messungen (${ph.length})`);
    const tc = [M, M + 90, M + 150, M + 210, M + 300];
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted);
    ['Datum', 'Uhrzeit', 'Wert', 'Abweichung', 'Status'].forEach((h, i) => doc.text(h, tc[i], doc.y, { lineBreak: false }));
    doc.moveDown(1);
    for (const s of ph) {
      ensure(15);
      const y = doc.y;
      const dev = S.phDeviation(s.value, derived.phTarget);
      const st = S.phStatus(s.value, derived.phTarget);
      doc.font('Helvetica').fontSize(9.5).fillColor(C.text);
      doc.text(T.formatDE(T.dayKey(s.time)), tc[0], y, { lineBreak: false });
      doc.text(T.timeHM(s.time), tc[1], y, { lineBreak: false });
      doc.text(fmt(s.value, 1), tc[2], y, { lineBreak: false });
      doc.text(dev == null ? '–' : dev === 0 ? 'im Ziel' : (dev > 0 ? '+' : '') + fmt(dev, 1), tc[3], y, { lineBreak: false });
      if (st) doc.fillColor(C[st]).text(statusLabel[st], tc[4], y, { lineBreak: false });
      doc.y = y + 14;
    }
  }

  // ---------- notes / tags ----------
  const noted = days.filter((d) => d.note || d.tags.length);
  if (noted.length) {
    heading('Tagebuch');
    for (const d of noted) {
      ensure(30);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(T.formatDE(d.day), M, doc.y, { continued: !!d.tags.length });
      if (d.tags.length) doc.font('Helvetica').fillColor(C.muted).text('   ' + d.tags.map((t) => '#' + t.name).join('  '));
      if (d.note) doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text(d.note, M + 10, doc.y, { width: W - 10 });
      doc.moveDown(0.4);
    }
  }

  // ---------- findings ----------
  const findings = [
    ...analysis.correlations.filter((f) => f.reliable && Math.abs(f.r) >= 0.3),
    ...analysis.tags.filter((f) => f.reliable),
  ].slice(0, 10);
  heading('Auffälligkeiten und Zusammenhänge');
  if (!findings.length) {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text('Im gewählten Zeitraum gibt es (noch) keine belastbaren Zusammenhänge. Dafür werden mindestens 14 Tage mit gemeinsamen Messwerten benötigt.', { width: W });
  }
  for (const f of findings) {
    ensure(34);
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text('•  ' + pdfText(f.text || ''), M, doc.y, { width: W });
    if (f.kind === 'correlation') doc.fontSize(8).fillColor(C.muted).text(`    Zusammenhang ${f.strength} (r = ${fmt(f.r, 2)}, ${f.n} Tage)`);
    doc.moveDown(0.3);
  }
  doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(8).fillColor(C.muted)
    .text('Hinweis: Zusammenhänge sind statistische Auffälligkeiten aus den eigenen Messwerten und keine medizinische Diagnose.', { width: W });

  // page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing into the margin must not create a new page
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text(`Seite ${i + 1} von ${range.count}`, M, doc.page.height - M + 10, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
}

module.exports = { buildReport };
