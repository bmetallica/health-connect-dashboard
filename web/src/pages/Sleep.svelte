<script>
  import { get } from '../lib/api.js';
  import { COLORS, STAGES, STATUS, alpha } from '../lib/theme.js';
  import { num, dur, fmtTime, fmtDay, fmtDayLong, avg } from '../lib/format.js';
  import { dayAxis, valueAxis, zoom, grid, dayTooltip } from '../lib/charts.js';
  import PageHead from '../components/PageHead.svelte';
  import RangePicker from '../components/RangePicker.svelte';
  import Card from '../components/Card.svelte';
  import Chart from '../components/Chart.svelte';
  import Stat from '../components/Stat.svelte';
  import ScoreRing from '../components/ScoreRing.svelte';
  import Breakdown from '../components/Breakdown.svelte';
  import Empty from '../components/Empty.svelte';
  import Loading from '../components/Loading.svelte';

  let range = $state({ mode: 'month' });
  let sum = $state(null);
  let sessions = $state([]);
  let selDay = $state(null);
  let loading = $state(true);

  $effect(() => {
    if (!range.from) return;
    const { from, to } = range;
    loading = true;
    Promise.all([get('/summary', { from, to }), get('/sleep', { from, to })]).then(([s, sl]) => {
      if (range.from !== from || range.to !== to) return;
      sum = s;
      sessions = sl.sessions;
      selDay = sessions.length ? sessions.reduce((a, b) => (b.end > a.end ? b : a)).day : null;
      loading = false;
    });
  });

  const days = $derived(sum?.days || []);
  const nights = $derived(days.filter((d) => d.sleep));
  const ORDER = ['deep', 'light', 'sleeping', 'rem', 'awake', 'awake_in_bed'];
  const usedStages = $derived(ORDER.filter((k) => nights.some((d) => d.sleep.stages[k])));
  const stats = $derived.by(() => {
    if (!nights.length) return null;
    const pct = (k) => avg(nights.filter((d) => d.sleep.mainDurationMs).map((d) => ((d.sleep.stages[k] || 0) / d.sleep.mainDurationMs) * 100));
    // bed / wake times as minutes after 18:00 so midnight does not break the average
    const mins = (t) => {
      const dt = new Date(t);
      return (dt.getHours() * 60 + dt.getMinutes() + 360) % 1440;
    };
    const fmtMin = (m) => {
      const x = Math.round(m - 360 + 1440) % 1440;
      return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    };
    return {
      avgMs: avg(nights.map((d) => d.sleep.totalMs)),
      deep: pct('deep'),
      rem: pct('rem'),
      bed: fmtMin(avg(nights.map((d) => mins(d.sleep.start)))),
      wake: fmtMin(avg(nights.map((d) => mins(d.sleep.end)))),
    };
  });
  const daySessions = $derived(sessions.filter((s) => s.day === selDay).sort((a, b) => a.start - b.start));
  const sel = $derived.by(() => {
    if (!daySessions.length) return null;
    const main = daySessions.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
    const night = days.find((d) => d.day === selDay)?.sleep;
    return { day: selDay, start: daySessions[0].start, end: daySessions[daySessions.length - 1].end, durationMs: night ? night.totalMs : main.durationMs, stages: daySessions.flatMap((s) => (s.stages.length ? s.stages : [{ start: s.start, end: s.end, name: 'sleeping' }])), score: main.score, parts: daySessions.length };
  });

  const barOption = $derived.by(() => {
    const z = zoom(days.length);
    const stageSeries = usedStages.map((k) => ({
      name: STAGES[k].label, type: 'bar', stack: 's', barMaxWidth: 26,
      data: days.map((d) => (d.sleep && d.sleep.stages[k] ? +(d.sleep.stages[k] / 3600000).toFixed(2) : null)),
      itemStyle: { color: STAGES[k].color },
    }));
    // nights without stage data: show the total as one bar
    const plain = days.map((d) => (d.sleep && !Object.keys(d.sleep.stages).some((k) => ORDER.includes(k)) ? +(d.sleep.totalMs / 3600000).toFixed(2) : null));
    if (plain.some((v) => v != null)) stageSeries.push({ name: 'Schlaf', type: 'bar', stack: 's', barMaxWidth: 26, data: plain, itemStyle: { color: COLORS.sleep } });
    if (stageSeries.length) {
      const last = stageSeries[stageSeries.length - 1];
      last.itemStyle = { ...last.itemStyle, borderRadius: [6, 6, 0, 0] };
      stageSeries[0].markArea = { silent: true, itemStyle: { color: 'rgba(52,211,153,0.06)' }, label: { show: true, position: 'insideTopLeft', color: '#34d399', fontSize: 10, formatter: 'Empfohlen 7–9 h' }, data: [[{ yAxis: 7 }, { yAxis: 9 }]] };
    }
    return {
      grid: grid(!!z, { top: 36 }),
      dataZoom: z,
      legend: { top: 0, left: 0 },
      tooltip: dayTooltip((i) => {
        const d = days[i];
        if (!d.sleep) return [];
        return [['Gesamt', dur(d.sleep.totalMs), COLORS.sleep], ['Zeitraum', `${fmtTime(d.sleep.start)} – ${fmtTime(d.sleep.end)}`, '#64748b'],
          ...usedStages.filter((k) => d.sleep.stages[k]).map((k) => [STAGES[k].label, dur(d.sleep.stages[k]), STAGES[k].color])];
      }),
      xAxis: dayAxis(days),
      yAxis: valueAxis({ min: 0, axisLabel: { formatter: '{value} h' } }),
      series: stageSeries,
    };
  });

  function onBarClick(p) {
    const d = days[p.dataIndex];
    if (!d || !d.sleep) return;
    selDay = d.day;
  }

  // hypnogram: stages as horizontal blocks over the night
  const LEVEL = { awake: 3, awake_in_bed: 3, out_of_bed: 3, rem: 2, light: 1, sleeping: 1, deep: 0, unknown: 1 };
  const hypOption = $derived.by(() => {
    if (!sel) return null;
    const st = sel.stages;
    return {
      grid: { left: 6, right: 12, top: 10, bottom: 6, containLabel: true },
      tooltip: { formatter: (p) => `${STAGES[p.data.name]?.label || p.data.name}<br>${fmtTime(p.value[1])} – ${fmtTime(p.value[2])} · ${dur(p.value[2] - p.value[1])}` },
      xAxis: { type: 'time', min: sel.start, max: sel.end, axisLabel: { formatter: (v) => fmtTime(v), hideOverlap: true } },
      yAxis: { type: 'category', data: ['Tief', 'Leicht', 'REM', 'Wach'], axisLabel: { color: '#94a3b8' } },
      series: [{
        type: 'custom',
        renderItem: (params, api) => {
          const lvl = api.value(0);
          const a = api.coord([api.value(1), lvl]);
          const b = api.coord([api.value(2), lvl]);
          const h = api.size([0, 1])[1] * 0.7;
          return { type: 'rect', shape: { x: a[0], y: a[1] - h / 2, width: Math.max(1, b[0] - a[0]), height: h, r: 3 }, style: { fill: api.visual('color') } };
        },
        encode: { x: [1, 2], y: 0 },
        data: st.map((s) => ({ name: s.name, value: [LEVEL[s.name] ?? 1, s.start, s.end], itemStyle: { color: STAGES[s.name]?.color || '#64748b' } })),
      }],
    };
  });

  const calOption = $derived.by(() => {
    if (days.length < 21) return null;
    return {
      tooltip: { formatter: (p) => `${fmtDay(p.value[0], { year: true })}<br><b>${p.value[1] == null ? 'keine Daten' : num(p.value[1], 1) + ' h'}</b>` },
      visualMap: { show: false, min: 4, max: 9, inRange: { color: ['#3b1d6e', '#6d28d9', '#a78bfa', '#ddd6fe'] } },
      calendar: { range: [days[0].day, days[days.length - 1].day], cellSize: [days.length > 120 ? 'auto' : 18, days.length > 120 ? 13 : 18], top: 24, left: 30, right: 10, orient: 'horizontal' },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: nights.map((d) => [d.day, +(d.sleep.totalMs / 3600000).toFixed(1)]) }],
    };
  });
</script>

<PageHead title="Schlaf" subtitle="Dauer, Phasen und Bewertung deiner Nächte" />
<div class="stack">
  <RangePicker bind:range modes={['week', 'month', 'quarter', 'year', 'all']} />

  {#if loading && !sum}
    <Loading height={320} />
  {:else if !nights.length}
    <Card><Empty icon="🌙" title="Keine Schlafdaten im Zeitraum" /></Card>
  {:else}
    <div class="stagger stack">
      <div class="grid g2">
        <Card accent={COLORS.sleep}>
          <div class="statrow">
            <ScoreRing score={sum.sleep?.total} status={sum.sleep?.status} size={104} stroke={9} label="Schlaf" />
            <div class="grid g2 sg">
              <Stat label="Ø Dauer" value={dur(stats.avgMs)} />
              <Stat label="Nächte" value={`${nights.length}`} sub={`von ${days.length} Tagen`} />
              <Stat label="Ø Einschlafen" value={stats.bed} unit="Uhr" />
              <Stat label="Ø Aufwachen" value={stats.wake} unit="Uhr" />
              {#if stats.deep != null && usedStages.includes('deep')}<Stat label="Ø Tiefschlaf" value={num(stats.deep)} unit="%" color={STAGES.deep.color} />{/if}
              {#if stats.rem != null && usedStages.includes('rem')}<Stat label="Ø REM" value={num(stats.rem)} unit="%" color={STAGES.rem.color} />{/if}
            </div>
          </div>
        </Card>
        <Card title={sel ? 'Nacht ' + fmtDayLong(sel.day) : 'Nacht'} subtitle={sel ? `${fmtTime(sel.start)} – ${fmtTime(sel.end)} · ${dur(sel.durationMs)}${sel.parts > 1 ? ` (${sel.parts} Abschnitte)` : ''}` : ''} accent={COLORS.sleep}>
          {#if sel}
            {#snippet actions()}<span class="badge {sel.score.status}">{STATUS[sel.score.status].icon} {sel.score.total}</span>{/snippet}
            <Chart option={hypOption} height={150} />
            <div style="margin-top:10px"><Breakdown items={sel.score.breakdown} /></div>
          {/if}
        </Card>
      </div>

      <Card title="Schlaf pro Nacht" subtitle="Antippen zeigt die Nacht im Detail" accent={COLORS.sleep}>
        <div class="no-swipe"><Chart option={barOption} height={300} onclick={onBarClick} /></div>
      </Card>

      {#if calOption}
        <Card title="Kalender" subtitle="Schlafdauer pro Nacht – heller bedeutet länger" accent={COLORS.sleep}>
          <Chart option={calOption} height={170} />
        </Card>
      {/if}

      <Card title="Alle Nächte" accent={COLORS.sleep}>
        <div class="table-wrap">
          <table class="list">
            <thead><tr><th>Nacht zum</th><th>Einschlafen</th><th>Aufwachen</th><th>Dauer</th><th>Bewertung</th></tr></thead>
            <tbody>
              {#each [...sessions].sort((a, b) => b.end - a.end) as s}
                <tr onclick={() => (selDay = s.day)} class:sel={s.day === selDay} style="cursor:pointer">
                  <td>{fmtDay(s.day)}</td><td class="num">{fmtTime(s.start)}</td><td class="num">{fmtTime(s.end)}</td><td class="num">{dur(s.durationMs)}</td>
                  <td>{#if s.durationMs >= 3 * 3600000}<span class="badge {s.score.status}">{s.score.total}</span>{:else}<span class="badge neutral" title="kurzer Abschnitt – wird zur Nacht gezählt, aber nicht einzeln bewertet">Abschnitt</span>{/if}{#if s.edited}<span class="badge info" style="margin-left:6px">bearbeitet</span>{/if}{#if s.manual}<span class="badge neutral" style="margin-left:6px">manuell</span>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  {/if}
</div>

<style>
  .statrow { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .sg { flex: 1; min-width: 240px; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  tr.sel td { background: rgba(167, 139, 250, 0.08); }
</style>
