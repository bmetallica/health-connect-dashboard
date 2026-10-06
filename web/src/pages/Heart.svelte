<script>
  import { get } from '../lib/api.js';
  import { app } from '../lib/state.svelte.js';
  import { COLORS, alpha } from '../lib/theme.js';
  import { num, dur, dayStart, addDays, avg } from '../lib/format.js';
  import { dayAxis, valueAxis, zoom, grid, gradientArea, dayTooltip, timeTooltip, timeAxisLabels } from '../lib/charts.js';
  import PageHead from '../components/PageHead.svelte';
  import RangePicker from '../components/RangePicker.svelte';
  import Card from '../components/Card.svelte';
  import Chart from '../components/Chart.svelte';
  import Stat from '../components/Stat.svelte';
  import ScoreRing from '../components/ScoreRing.svelte';
  import Empty from '../components/Empty.svelte';
  import Loading from '../components/Loading.svelte';

  let range = $state({ mode: 'week' });
  let sum = $state(null);
  let series = $state(null);
  let zones = $state(null);
  let loading = $state(true);

  $effect(() => {
    if (!range.from) return;
    const { from, to } = range;
    loading = true;
    const short = from === to || addDays(from, 2) >= to;
    Promise.all([
      get('/summary', { from, to }),
      get('/hr-zones', { from, to }),
      short ? get('/series/hr', { from: dayStart(from), to: dayStart(addDays(to, 1)), max: 1500 }) : Promise.resolve(null),
    ]).then(([s, z, se]) => {
      if (range.from !== from || range.to !== to) return;
      sum = s;
      zones = z;
      series = se;
      loading = false;
    });
  });

  const days = $derived(sum?.days || []);
  const hrDays = $derived(days.filter((d) => d.hr));
  const stats = $derived.by(() => {
    if (!hrDays.length) return null;
    return {
      avg: avg(hrDays.map((d) => d.hr.avg)),
      min: Math.min(...hrDays.map((d) => d.hr.min)),
      max: Math.max(...hrDays.map((d) => d.hr.max)),
      count: hrDays.reduce((a, d) => a + d.hr.count, 0),
      hrv: avg(days.filter((d) => d.hrv != null).map((d) => d.hrv)),
    };
  });
  const ref = $derived(sum?.resting?.ref);

  const mainOption = $derived.by(() => {
    if (series) {
      const pts = series.points;
      const span = dayStart(addDays(range.to, 1)) - dayStart(range.from);
      return {
        grid: grid(false),
        tooltip: timeTooltip('bpm'),
        xAxis: { type: 'time', min: dayStart(range.from), max: Math.min(Date.now(), dayStart(addDays(range.to, 1))), axisLabel: timeAxisLabels(span) },
        yAxis: valueAxis({ min: (v) => Math.max(0, Math.floor(v.min / 10) * 10 - 10) }),
        visualMap: { show: false, type: 'piecewise', dimension: 1, pieces: [{ lt: 100, color: COLORS.hr }, { gte: 100, lt: 130, color: '#fb923c' }, { gte: 130, color: '#f43f5e' }] },
        series: [{
          type: 'line', data: pts.map((p) => [p.t, Math.round(p.v)]), showSymbol: false, smooth: 0.25, lineStyle: { width: 1.8 },
          areaStyle: { opacity: 0.18 }, connectNulls: false,
          markLine: ref ? { silent: true, symbol: 'none', label: { color: '#94a3b8', formatter: 'Ruhe-Zielbereich' }, lineStyle: { color: alpha(COLORS.hr, 0.4), type: 'dashed' }, data: [{ yAxis: ref.okHi }] } : undefined,
        }],
      };
    }
    const z = zoom(days.length);
    return {
      grid: grid(!!z),
      dataZoom: z,
      legend: { top: 0, right: 0, data: ['Ø Puls', 'Ruhepuls'] },
      tooltip: dayTooltip((i) => {
        const d = days[i];
        return [['Ø Puls', d.hr ? num(d.hr.avg) + ' bpm' : null, COLORS.hr], ['Min – Max', d.hr ? `${d.hr.min} – ${d.hr.max} bpm` : null, alpha(COLORS.hr, 0.5)], ['Ruhepuls', d.resting ? num(d.resting.value) + ' bpm' : null, COLORS.resting], ['Messwerte', d.hr ? num(d.hr.count) : null, '#64748b']];
      }),
      xAxis: dayAxis(days),
      yAxis: valueAxis(),
      series: [
        { name: 'min', type: 'line', stack: 'band', data: days.map((d) => d.hr?.min ?? null), lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
        { name: 'band', type: 'line', stack: 'band', data: days.map((d) => (d.hr ? d.hr.max - d.hr.min : null)), lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: alpha(COLORS.hr, 0.13) }, silent: true },
        { name: 'Ø Puls', type: 'line', data: days.map((d) => (d.hr ? Math.round(d.hr.avg) : null)), smooth: 0.3, symbolSize: 6, lineStyle: { width: 2.5 }, itemStyle: { color: COLORS.hr } },
        { name: 'Ruhepuls', type: 'line', data: days.map((d) => (d.resting ? Math.round(d.resting.value) : null)), smooth: 0.3, symbolSize: 5, lineStyle: { width: 2, type: 'dashed' }, itemStyle: { color: COLORS.resting } },
      ],
    };
  });

  const restOption = $derived.by(() => {
    const z = zoom(days.length);
    return {
      grid: grid(!!z),
      dataZoom: z,
      tooltip: dayTooltip((i) => [['Ruhepuls', days[i].resting ? num(days[i].resting.value) + ' bpm' + (days[i].resting.measured ? ' (gemessen)' : ' (Tagesminimum)') : null, COLORS.resting]]),
      xAxis: dayAxis(days),
      // start below the lowest value (and the target band) so every bar stays visible
      yAxis: valueAxis({ min: (v) => Math.max(0, Math.floor(Math.min(v.min, ref?.okLo ?? v.min) / 5) * 5 - 5) }),
      series: [{
        type: 'bar', barMaxWidth: 22, data: days.map((d) => (d.resting ? Math.round(d.resting.value) : null)),
        itemStyle: { borderRadius: [6, 6, 2, 2], color: (p) => (ref && (p.value < 40 || p.value > ref.okHi) ? alpha(COLORS.resting, 0.55) : COLORS.resting) },
        markArea: ref ? { silent: true, itemStyle: { color: 'rgba(52,211,153,0.07)' }, label: { show: true, position: 'insideTopRight', color: '#34d399', fontSize: 10, formatter: 'Zielbereich' }, data: [[{ yAxis: ref.okLo }, { yAxis: ref.okHi }]] } : undefined,
      }],
    };
  });

  const zoneOption = $derived.by(() => {
    if (!zones) return null;
    const cols = ['#64748b', '#38bdf8', '#4ade80', '#fb923c', '#f43f5e'];
    const zs = zones.zones;
    return {
      grid: { left: 6, right: 60, top: 6, bottom: 6, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p) => `${zs[p.dataIndex].label} (${zs[p.dataIndex].min}–${zs[p.dataIndex].max >= 300 ? '∞' : zs[p.dataIndex].max} bpm)<br><b>${p.value} %</b> · ${dur(zs[p.dataIndex].ms)}` },
      xAxis: { type: 'value', max: 100, show: false },
      yAxis: { type: 'category', data: zs.map((z) => z.label), inverse: true, axisLabel: { color: '#cbd5e1', fontSize: 12 } },
      series: [{
        type: 'bar', data: zs.map((z, i) => ({ value: z.pct, itemStyle: { color: cols[i] } })), barWidth: 14, showBackground: true,
        backgroundStyle: { color: 'rgba(148,163,184,0.08)', borderRadius: 7 }, itemStyle: { borderRadius: 7 },
        label: { show: true, position: 'right', color: '#cbd5e1', formatter: (p) => `${p.value} %` },
      }],
    };
  });

  const hrvOption = $derived.by(() => {
    const has = days.some((d) => d.hrv != null);
    if (!has) return null;
    return {
      grid: grid(false),
      tooltip: dayTooltip((i) => [['HRV', days[i].hrv != null ? num(days[i].hrv) + ' ms' : null, COLORS.hrv]]),
      xAxis: dayAxis(days),
      yAxis: valueAxis(),
      series: [{ type: 'line', data: days.map((d) => (d.hrv != null ? Math.round(d.hrv) : null)), smooth: 0.3, connectNulls: true, itemStyle: { color: COLORS.hrv }, areaStyle: gradientArea(COLORS.hrv) }],
    };
  });
</script>

<PageHead title="Herz" subtitle="Puls, Ruhepuls und Belastung" />
<div class="stack">
  <RangePicker bind:range />

  {#if loading && !sum}
    <Loading height={320} />
  {:else if !hrDays.length}
    <Card><Empty icon="❤️" title="Keine Pulsdaten im Zeitraum" text="Wähle einen anderen Zeitraum oder prüfe die Synchronisation." /></Card>
  {:else}
    <div class="stagger stack">
      <Card accent={COLORS.hr}>
        <div class="statrow">
          <ScoreRing score={sum.resting?.total} status={sum.resting?.status} size={92} stroke={8} label="Ruhepuls" />
          <Stat label="Ø Puls" value={num(stats.avg)} unit="bpm" />
          <Stat label="Ruhepuls Ø" value={num(sum.resting?.resting)} unit="bpm" sub={ref ? `Ziel ${ref.okLo}–${ref.okHi}${sum.resting.personal ? '' : ' (allg.)'}` : ''} color={COLORS.resting} />
          <Stat label="Minimum" value={num(stats.min)} unit="bpm" />
          <Stat label="Maximum" value={num(stats.max)} unit="bpm" />
          {#if stats.hrv != null}<Stat label="HRV Ø" value={num(stats.hrv)} unit="ms" color={COLORS.hrv} />{/if}
          <Stat label="Messwerte" value={num(stats.count)} />
        </div>
      </Card>

      <Card title={series ? 'Pulsverlauf' : 'Puls pro Tag'} subtitle={series ? 'Einzelmessungen' : 'Ø, Spanne Min–Max und Ruhepuls'} accent={COLORS.hr}>
        <div class="no-swipe"><Chart option={mainOption} height={300} /></div>
      </Card>

      <div class="grid g2">
        <Card title="Ruhepuls pro Tag" subtitle="niedrigster Wert des Tages bzw. gemessener Ruhepuls" accent={COLORS.resting}>
          <Chart option={restOption} height={240} />
        </Card>
        <Card title="Belastungszonen" subtitle={zones?.maxHr ? `bezogen auf max. Herzfrequenz ${zones.maxHr} bpm` : 'feste Bereiche (Geburtsdatum im Profil fehlt)'} accent="#fb923c">
          {#if zoneOption}<Chart option={zoneOption} height={240} />{/if}
        </Card>
      </div>

      {#if hrvOption}
        <Card title="Herzfrequenzvariabilität (HRV)" subtitle="RMSSD in ms – höher bedeutet meist bessere Erholung" accent={COLORS.hrv}>
          <Chart option={hrvOption} height={220} />
        </Card>
      {/if}
    </div>
  {/if}
</div>

<style>
  .statrow { display: flex; align-items: center; gap: 18px 32px; flex-wrap: wrap; }
  @media (max-width: 720px) { .statrow { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; } .statrow :global(.ring) { grid-row: span 2; justify-self: center; } }
</style>
