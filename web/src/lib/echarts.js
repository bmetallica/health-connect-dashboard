// tree-shaken ECharts with a dark theme matching the app
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, PieChart, HeatmapChart, CustomChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, DataZoomComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  LegendComponent, CalendarComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import langDE from 'echarts/i18n/langDE-obj.js';

echarts.use([
  LineChart, BarChart, ScatterChart, PieChart, HeatmapChart, CustomChart,
  GridComponent, TooltipComponent, DataZoomComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  LegendComponent, CalendarComponent, VisualMapComponent, CanvasRenderer,
]);

echarts.registerLocale('DE', langDE);

const text = '#cbd5e1';
const muted = '#64748b';
const line = 'rgba(148,163,184,0.12)';

echarts.registerTheme('health', {
  backgroundColor: 'transparent',
  textStyle: { color: text, fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  color: ['#22d3ee', '#a78bfa', '#4ade80', '#fb7185', '#facc15', '#fb923c', '#60a5fa'],
  grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
  categoryAxis: {
    axisLine: { lineStyle: { color: line } },
    axisTick: { show: false },
    axisLabel: { color: muted, fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: muted, fontSize: 11 },
    splitLine: { lineStyle: { color: line } },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: line } },
    axisTick: { show: false },
    axisLabel: { color: muted, fontSize: 11, hideOverlap: true },
    splitLine: { show: false },
  },
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.96)',
    borderColor: 'rgba(148,163,184,0.2)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#e2e8f0', fontSize: 12 },
    extraCssText: 'border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.45);backdrop-filter:blur(8px);',
  },
  legend: { textStyle: { color: text, fontSize: 12 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
  dataZoom: {
    borderColor: 'transparent',
    backgroundColor: 'rgba(148,163,184,0.06)',
    fillerColor: 'rgba(34,211,238,0.12)',
    handleStyle: { color: '#22d3ee', borderColor: '#22d3ee' },
    moveHandleStyle: { color: 'rgba(34,211,238,0.4)' },
    textStyle: { color: muted },
    dataBackground: { lineStyle: { color: muted }, areaStyle: { color: 'rgba(100,116,139,0.2)' } },
  },
  calendar: {
    itemStyle: { color: 'rgba(148,163,184,0.06)', borderColor: '#0b1020', borderWidth: 3 },
    splitLine: { show: false },
    dayLabel: { color: muted, nameMap: ['S', 'M', 'D', 'M', 'D', 'F', 'S'], firstDay: 1 },
    monthLabel: { color: muted, nameMap: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'] },
    yearLabel: { show: false },
  },
});

export const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export { echarts };
