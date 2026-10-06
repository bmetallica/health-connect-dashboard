// shared ECharts option builders
import { fmtDay, fmtDateTime, num } from './format.js';
import { alpha } from './theme.js';

export function dayAxis(days, extra = {}) {
  return {
    type: 'category',
    data: days.map((d) => d.day),
    boundaryGap: true,
    axisLabel: { formatter: (k) => fmtDay(k, { weekday: days.length <= 14 }).replace(/\.$/, '.'), hideOverlap: true },
    ...extra,
  };
}

export function valueAxis(extra = {}) {
  return { type: 'value', scale: true, splitNumber: 4, axisLabel: { formatter: (v) => v.toLocaleString('de-DE') }, ...extra };
}

// slider zoom for long ranges (dragging a window over all data)
export function zoom(n, threshold = 60) {
  if (n <= threshold) return undefined;
  return [
    { type: 'inside', start: Math.max(0, 100 - (threshold / n) * 100), end: 100, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false },
    { type: 'slider', height: 18, bottom: 4, start: Math.max(0, 100 - (threshold / n) * 100), end: 100, brushSelect: false },
  ];
}

export function grid(hasZoom, extra = {}) {
  return { left: 6, right: 10, top: 28, bottom: hasZoom ? 36 : 6, containLabel: true, ...extra };
}

export function gradientArea(color, a1 = 0.35, a2 = 0) {
  return {
    color: {
      type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [{ offset: 0, color: alpha(color, a1) }, { offset: 1, color: alpha(color, a2) }],
    },
  };
}

export function dayTooltip(rows) {
  // rows: (dataIndex) => [ [label, valueString, color], ... ]
  return {
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: 'rgba(148,163,184,0.35)' } },
    formatter: (ps) => {
      const p = Array.isArray(ps) ? ps[0] : ps;
      const lines = rows(p.dataIndex).filter((r) => r && r[1] != null && r[1] !== '–');
      return `<b>${fmtDay(p.name, { year: true })}</b><br>` + lines.map(([l, v, c]) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px"></span>${l}: <b>${v}</b>`).join('<br>');
    },
  };
}

export function timeTooltip(unit, digits = 0) {
  return {
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: 'rgba(148,163,184,0.35)' } },
    formatter: (ps) => {
      const p = Array.isArray(ps) ? ps[0] : ps;
      const v = Array.isArray(p.value) ? p.value[1] : p.value;
      return `${fmtDateTime(Array.isArray(p.value) ? p.value[0] : p.axisValue)}<br><b>${num(v, digits)} ${unit}</b>`;
    },
  };
}

// time axis labels in German: clock time for short spans, date otherwise
export function timeAxisLabels(spanMs) {
  return {
    hideOverlap: true,
    formatter: (v) => {
      const d = new Date(v);
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const dm = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
      if (spanMs <= 36 * 3600000) return hm;
      return hm === '00:00' || spanMs > 4 * 86400000 ? dm : `${dm}\n${hm}`;
    },
  };
}
