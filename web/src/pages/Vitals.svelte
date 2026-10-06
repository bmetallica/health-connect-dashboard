<script>
  import { get } from '../lib/api.js';
  import { COLORS, alpha } from '../lib/theme.js';
  import { num, dayStart, addDays, avg } from '../lib/format.js';
  import { dayAxis, valueAxis, zoom, grid, dayTooltip, timeTooltip, timeAxisLabels, gradientArea } from '../lib/charts.js';
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
  let spo2 = $state(null);
  let loading = $state(true);

  $effect(() => {
    if (!range.from) return;
    const { from, to } = range;
    loading = true;
    const short = addDays(from, 6) >= to;
    Promise.all([
      get('/summary', { from, to }),
      short ? get('/series/spo2', { from: dayStart(from), to: dayStart(addDays(to, 1)), max: 2000 }) : Promise.resolve(null),
    ]).then(([s, se]) => {
      if (range.from !== from || range.to !== to) return;
      sum = s;
      spo2 = se;
      loading = false;
    });
  });

  const days = $derived(sum?.days || []);
  const sp = $derived(sum?.spo2);

  const spo2Option = $derived.by(() => {
    if (spo2 && spo2.points.length) {
      const span = dayStart(addDays(range.to, 1)) - dayStart(range.from);
      return {
        grid: grid(false),
        tooltip: { trigger: 'item', formatter: (p) => `${new Date(p.value[0]).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}<br><b>${num(p.value[1])} %</b>` },
        xAxis: { type: 'time', min: dayStart(range.from), max: Math.min(Date.now(), dayStart(addDays(range.to, 1))), axisLabel: timeAxisLabels(span) },
        yAxis: valueAxis({ max: 100, min: (v) => Math.min(90, Math.floor(v.min) - 1) }),
        visualMap: { show: false, dimension: 1, pieces: [{ lt: 90, color: '#f87171' }, { gte: 90, lt: 95, color: '#fbbf24' }, { gte: 95, color: COLORS.spo2 }] },
        series: [{
          type: 'scatter', symbolSize: 5, data: spo2.points.map((p) => [p.t, p.v]),
          markArea: { silent: true, itemStyle: { color: 'rgba(52,211,153,0.05)' }, data: [[{ yAxis: 95 }, { yAxis: 100 }]] },
        }],
      };
    }
    const z = zoom(days.length);
    return {
      grid: grid(!!z),
      dataZoom: z,
      tooltip: dayTooltip((i) => {
        const d = days[i];
        return [['Ø SpO₂', d.spo2 ? num(d.spo2.avg, 1) + ' %' : null, COLORS.spo2], ['Minimum', d.spo2 ? d.spo2.min + ' %' : null, '#f87171'], ['Messungen', d.spo2 ? d.spo2.count : null, '#64748b']];
      }),
      xAxis: dayAxis(days),
      yAxis: valueAxis({ max: 100 }),
      series: [
        { name: 'Ø', type: 'line', data: days.map((d) => (d.spo2 ? +d.spo2.avg.toFixed(1) : null)), smooth: 0.3, itemStyle: { color: COLORS.spo2 }, areaStyle: gradientArea(COLORS.spo2, 0.25) },
        { name: 'Min', type: 'scatter', data: days.map((d) => (d.spo2 ? d.spo2.min : null)), symbolSize: 6, itemStyle: { color: alpha('#f87171', 0.8) } },
      ],
    };
  });

  const others = $derived([
    { key: 'respRate', label: 'Atemfrequenz', unit: '/min', digits: 1, color: COLORS.resp, get: (d) => d.respRate },
    { key: 'temp', label: 'Körpertemperatur', unit: '°C', digits: 1, color: COLORS.temp, get: (d) => d.temp },
    { key: 'glucose', label: 'Blutzucker', unit: 'mg/dl', digits: 0, color: '#c084fc', get: (d) => d.glucose },
  ].filter((x) => days.some((d) => x.get(d) != null)));
  const hasBp = $derived(days.some((d) => d.bp));

  function lineOption(x) {
    return {
      grid: grid(false),
      tooltip: dayTooltip((i) => [[x.label, x.get(days[i]) != null ? num(x.get(days[i]), x.digits) + ' ' + x.unit : null, x.color]]),
      xAxis: dayAxis(days),
      yAxis: valueAxis(),
      series: [{ type: 'line', data: days.map((d) => (x.get(d) != null ? +x.get(d).toFixed(x.digits) : null)), smooth: 0.3, connectNulls: true, itemStyle: { color: x.color }, areaStyle: gradientArea(x.color, 0.2) }],
    };
  }
  const bpOption = $derived({
    grid: grid(false),
    legend: { top: 0, right: 0 },
    tooltip: dayTooltip((i) => [['Blutdruck', days[i].bp ? `${num(days[i].bp.sys)} / ${num(days[i].bp.dia)} mmHg` : null, COLORS.bp]]),
    xAxis: dayAxis(days),
    yAxis: valueAxis(),
    series: [
      { name: 'Systolisch', type: 'line', data: days.map((d) => (d.bp ? Math.round(d.bp.sys) : null)), connectNulls: true, itemStyle: { color: COLORS.bp } },
      { name: 'Diastolisch', type: 'line', data: days.map((d) => (d.bp && d.bp.dia ? Math.round(d.bp.dia) : null)), connectNulls: true, itemStyle: { color: '#818cf8' } },
    ],
  });
</script>

<PageHead title="Vitalwerte" subtitle="Sauerstoffsättigung und weitere Vitaldaten" />
<div class="stack">
  <RangePicker bind:range />

  {#if loading && !sum}
    <Loading height={320} />
  {:else}
    <div class="stagger stack">
      {#if days.some((d) => d.spo2)}
        <Card accent={COLORS.spo2}>
          <div class="statrow">
            <ScoreRing score={sp?.total} status={sp?.status} size={92} stroke={8} label="SpO₂" />
            <Stat label="Durchschnitt" value={num(sp?.avg ?? avg(days.filter((d) => d.spo2).map((d) => d.spo2.avg)), 1)} unit="%" />
            <Stat label="Minimum" value={num(sp?.min)} unit="%" color={sp && sp.min < 90 ? '#f87171' : null} />
            <Stat label="unter 95 %" value={num(sp?.pctBelow95)} unit="% der Messungen" />
            <Stat label="Messungen" value={num(sp?.count)} />
          </div>
        </Card>
        <Card title="Sauerstoffsättigung (SpO₂)" subtitle={spo2 ? 'Einzelmessungen · grün hinterlegt: Normalbereich ≥ 95 %' : 'Tagesdurchschnitt und Minimum'} accent={COLORS.spo2}>
          <div class="no-swipe"><Chart option={spo2Option} height={280} /></div>
        </Card>
      {:else}
        <Card><Empty icon="🫁" title="Keine SpO₂-Daten im Zeitraum" /></Card>
      {/if}

      {#if hasBp}
        <Card title="Blutdruck" accent={COLORS.bp}><Chart option={bpOption} height={220} /></Card>
      {/if}
      {#if others.length}
        <div class="grid g2">
          {#each others as x}
            <Card title={x.label} accent={x.color}><Chart option={lineOption(x)} height={200} /></Card>
          {/each}
        </div>
      {/if}
      {#if !hasBp && !others.length}
        <Card>
          <Empty icon="➕" title="Weitere Vitalwerte" text="Atemfrequenz, Körpertemperatur, Blutdruck und Blutzucker erscheinen automatisch, sobald Health Connect sie liefert (in Health Sync bzw. später in der HC-Bridge-App aktivieren)." />
        </Card>
      {/if}
    </div>
  {/if}
</div>

<style>
  .statrow { display: flex; align-items: center; gap: 18px 32px; flex-wrap: wrap; }
  @media (max-width: 720px) { .statrow { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; } .statrow :global(.ring) { grid-row: span 2; justify-self: center; } }
</style>
