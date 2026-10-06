<script>
  import { get } from '../lib/api.js';
  import { COLORS, EXERCISE_TYPES, alpha } from '../lib/theme.js';
  import { num, dur, fmtDay, fmtTime, dayKey } from '../lib/format.js';
  import { dayAxis, valueAxis, zoom, grid, dayTooltip, gradientArea } from '../lib/charts.js';
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
  let exercise = $state([]);
  let loading = $state(true);

  $effect(() => {
    if (!range.from) return;
    const { from, to } = range;
    loading = true;
    Promise.all([get('/summary', { from, to }), get('/exercise', { from, to })]).then(([s, e]) => {
      if (range.from !== from || range.to !== to) return;
      sum = s;
      exercise = e.sessions;
      loading = false;
    });
  });

  const days = $derived(sum?.days || []);
  const goal = $derived(sum?.derived?.stepGoal || 10000);
  const st = $derived(sum?.steps);
  const SRC = { 'nl.appyhapps.healthsync': 'Band (Health Sync)', 'com.huawei.health': 'Huawei Health', 'com.sec.android.app.shealth': 'Samsung Health', 'com.google.android.apps.fitness': 'Google Fit', android: 'Handy (Android)' };
  const srcName = (s) => SRC[s] || s || '–';

  const stepOption = $derived.by(() => {
    const z = zoom(days.length);
    return {
      grid: grid(!!z),
      dataZoom: z,
      tooltip: dayTooltip((i) => {
        const d = days[i];
        return [['Schritte', d.steps != null ? num(d.steps) : null, COLORS.steps], ['Ziel', d.steps != null ? (d.steps >= goal ? 'erreicht ✓' : `${num((d.steps / goal) * 100)} %`) : null, '#64748b'],
          ['Quelle', d.stepsEdited ? 'manuell korrigiert' : d.stepsSource ? srcName(d.stepsSource) : null, '#64748b'], ['Distanz', d.distance != null ? num(d.distance, 1) + ' km' : null, COLORS.distance]];
      }),
      xAxis: dayAxis(days),
      yAxis: valueAxis({ min: 0 }),
      series: [{
        type: 'bar', barMaxWidth: 26,
        data: days.map((d) => ({ value: d.steps != null ? Math.round(d.steps) : null, itemStyle: { color: d.steps >= goal ? COLORS.steps : alpha(COLORS.steps, 0.45) } })),
        itemStyle: { borderRadius: [6, 6, 2, 2] },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: '#facc15', type: 'dashed', width: 1.5 }, label: { color: '#facc15', formatter: `Ziel ${num(goal)}`, position: 'insideEndTop' }, data: [{ yAxis: goal }] },
      }],
    };
  });

  const calOption = $derived.by(() => {
    if (days.length < 21) return null;
    return {
      tooltip: { formatter: (p) => `${fmtDay(p.value[0], { year: true })}<br><b>${num(p.value[1])} Schritte</b>` },
      visualMap: { show: false, min: 0, max: goal, inRange: { color: ['#0f2e1d', '#166534', '#22c55e', '#86efac'] } },
      calendar: { range: [days[0].day, days[days.length - 1].day], cellSize: [days.length > 120 ? 'auto' : 18, days.length > 120 ? 13 : 18], top: 24, left: 30, right: 10 },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: days.filter((d) => d.steps != null).map((d) => [d.day, Math.round(d.steps)]) }],
    };
  });

  const extras = $derived([
    { key: 'distance', label: 'Distanz', unit: 'km', digits: 1, color: COLORS.distance },
    { key: 'activeKcal', label: 'Aktive Kalorien', unit: 'kcal', digits: 0, color: COLORS.kcal },
    { key: 'totalKcal', label: 'Gesamtkalorien', unit: 'kcal', digits: 0, color: '#f97316' },
    { key: 'floors', label: 'Stockwerke', unit: '', digits: 0, color: '#a3e635' },
    { key: 'hydration', label: 'Trinkmenge', unit: 'l', digits: 2, color: '#38bdf8' },
  ].filter((x) => days.some((d) => d[x.key] != null)));

  function extraOption(x) {
    return {
      grid: grid(false),
      tooltip: dayTooltip((i) => [[x.label, days[i][x.key] != null ? num(days[i][x.key], x.digits) + ' ' + x.unit : null, x.color]]),
      xAxis: dayAxis(days),
      yAxis: valueAxis({ min: 0 }),
      series: [{ type: 'line', data: days.map((d) => d[x.key]), smooth: 0.3, connectNulls: true, symbolSize: 4, itemStyle: { color: x.color }, areaStyle: gradientArea(x.color) }],
    };
  }
</script>

<PageHead title="Aktivität" subtitle="Schritte, Bewegung und Training" />
<div class="stack">
  <RangePicker bind:range modes={['week', 'month', 'quarter', 'year', 'all']} />

  {#if loading && !sum}
    <Loading height={320} />
  {:else if !days.some((d) => d.steps != null)}
    <Card><Empty icon="👟" title="Keine Aktivitätsdaten im Zeitraum" /></Card>
  {:else}
    <div class="stagger stack">
      <div class="grid g2">
        <Card accent={COLORS.steps}>
          <div class="statrow">
            <ScoreRing score={st?.total} status={st?.status} size={104} stroke={9} label="Aktivität" />
            <div class="grid sg">
              <Stat label="Ø pro Tag" value={num(st?.avg)} />
              <Stat label="Ø letzte 7" value={num(st?.avg7)} />
              <Stat label="Bestwert" value={num(st?.best?.steps)} sub={st?.best ? fmtDay(st.best.day) : ''} color={COLORS.steps} />
              <Stat label="Ziel erreicht" value={`${st?.goalDays ?? 0}`} unit={`/ ${st?.recorded ?? 0} Tage`} />
            </div>
          </div>
        </Card>
        <Card title="Bewertung" subtitle={`Tagesziel ${num(goal)} Schritte${sum.derived.stepGoalBasis ? ' (automatisch aus Trainingsziel)' : ''}`} accent={COLORS.steps}>
          {#if st}<Breakdown items={st.breakdown} />{/if}
          <p class="muted tiny" style="margin-top:12px">Quelle pro Tag nach Priorität (Standard: Band über Health Sync, sonst Handy). Einstellbar unter Profil → Datenquellen.</p>
        </Card>
      </div>

      <Card title="Schritte pro Tag" accent={COLORS.steps}>
        <div class="no-swipe"><Chart option={stepOption} height={300} /></div>
      </Card>

      {#if calOption}
        <Card title="Kalender" subtitle="Zielerreichung – heller bedeutet näher am Ziel" accent={COLORS.steps}>
          <Chart option={calOption} height={170} />
        </Card>
      {/if}

      {#if extras.length}
        <div class="grid g2">
          {#each extras as x}
            <Card title={x.label} accent={x.color}><Chart option={extraOption(x)} height={200} /></Card>
          {/each}
        </div>
      {/if}

      <Card title="Trainingseinheiten" accent={COLORS.kcal}>
        {#if exercise.length}
          <div class="table-wrap">
            <table class="list">
              <thead><tr><th>Datum</th><th>Art</th><th>Zeit</th><th>Dauer</th></tr></thead>
              <tbody>
                {#each [...exercise].reverse() as e}
                  <tr><td>{fmtDay(dayKey(e.start))}</td><td>{e.title || EXERCISE_TYPES[e.type] || 'Training'}</td><td class="num">{fmtTime(e.start)} – {fmtTime(e.end)}</td><td class="num">{dur(e.end - e.start)}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <Empty icon="🏃" title="Keine Trainingseinheiten" text="Trainings erscheinen hier, sobald Health Connect sie liefert (ExerciseSessionRecord in Health Sync/Tasker aktivieren)." />
        {/if}
      </Card>
    </div>
  {/if}
</div>

<style>
  .statrow { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .sg { flex: 1; min-width: 240px; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
</style>
