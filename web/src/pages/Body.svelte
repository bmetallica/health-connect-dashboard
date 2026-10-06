<script>
  import { get, post } from '../lib/api.js';
  import { app, toast, loadMeta } from '../lib/state.svelte.js';
  import { COLORS, alpha } from '../lib/theme.js';
  import { num, dayStart, addDays, nowLocalInput, parseNumber, fmtDateTime } from '../lib/format.js';
  import { valueAxis, grid, timeAxisLabels, gradientArea } from '../lib/charts.js';
  import PageHead from '../components/PageHead.svelte';
  import RangePicker from '../components/RangePicker.svelte';
  import Card from '../components/Card.svelte';
  import Chart from '../components/Chart.svelte';
  import Stat from '../components/Stat.svelte';
  import Empty from '../components/Empty.svelte';
  import Loading from '../components/Loading.svelte';

  let range = $state({ mode: 'quarter' });
  let weight = $state(null);
  let fat = $state(null);
  let profile = $state(null);
  let loading = $state(true);
  let reload = $state(0);
  let w = $state('');
  let wt = $state(nowLocalInput());

  $effect(() => {
    if (!range.from) return;
    reload;
    const { from, to } = range;
    const a = dayStart(from);
    const b = dayStart(addDays(to, 1));
    loading = true;
    Promise.all([get('/series/weight', { from: a, to: b, max: 5000 }), get('/series/body_fat', { from: a, to: b, max: 5000 }), get('/profile')]).then(([ws, fs, p]) => {
      weight = ws;
      fat = fs;
      profile = p;
      loading = false;
    });
  });

  const pts = $derived(weight?.points || []);
  const latest = $derived(pts.length ? pts[pts.length - 1] : null);
  const first = $derived(pts.length ? pts[0] : null);
  const height = $derived(profile?.profile?.heightCm ? profile.profile.heightCm / 100 : null);
  const bmi = (v) => (height ? v / (height * height) : null);
  const BMI_BANDS = [[0, 18.5, 'Untergewicht', '#60a5fa'], [18.5, 25, 'Normal', '#34d399'], [25, 30, 'Übergewicht', '#fbbf24'], [30, 35, 'Adipositas I', '#fb923c'], [35, 40, 'Adipositas II', '#f87171'], [40, 99, 'Adipositas III', '#ef4444']];

  // moving average over the last 7 days of measurements
  const ma = $derived(pts.map((p) => {
    const win = pts.filter((q) => q.t <= p.t && q.t > p.t - 7 * 86400000);
    return [p.t, +(win.reduce((a, q) => a + q.v, 0) / win.length).toFixed(2)];
  }));

  const option = $derived.by(() => {
    if (!pts.length) return null;
    const span = dayStart(addDays(range.to, 1)) - dayStart(range.from);
    return {
      grid: grid(false, { top: 32 }),
      legend: { top: 0, right: 0 },
      tooltip: { trigger: 'axis', formatter: (ps) => `${fmtDateTime(ps[0].value[0])}<br>` + ps.map((p) => `${p.seriesName}: <b>${num(p.value[1], 1)} kg</b>`).join('<br>') + (height ? `<br>BMI: <b>${num(bmi(ps[0].value[1]), 1)}</b>` : '') },
      xAxis: { type: 'time', min: dayStart(range.from), max: Math.min(Date.now(), dayStart(addDays(range.to, 1))), axisLabel: timeAxisLabels(span) },
      yAxis: valueAxis({ min: (v) => Math.floor(v.min - 2), max: (v) => Math.ceil(v.max + 2) }),
      series: [
        { name: 'Messung', type: 'line', data: pts.map((p) => [p.t, p.v]), symbolSize: 8, lineStyle: { width: 1, opacity: 0.4 }, itemStyle: { color: COLORS.weight } },
        { name: 'Trend (7 Tage)', type: 'line', data: ma, smooth: 0.4, showSymbol: false, lineStyle: { width: 3 }, itemStyle: { color: '#fdba74' }, areaStyle: gradientArea(COLORS.weight, 0.18) },
      ],
    };
  });

  async function add() {
    const v = parseNumber(w);
    if (!Number.isFinite(v)) return toast('Bitte ein Gewicht eingeben', 'err');
    if ((v < 30 || v > 250) && !confirmWarn) {
      confirmWarn = true;
      return toast(`${num(v, 1)} kg ist ungewöhnlich – zum Speichern erneut klicken`, 'warn', 5000);
    }
    try {
      await post('/edit/samples', { type: 'weight', value: v, time: wt });
      toast('Gewicht gespeichert');
      w = '';
      confirmWarn = false;
      reload++;
      loadMeta();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  let confirmWarn = $state(false);
</script>

<PageHead title="Körper" subtitle="Gewichtsverlauf, BMI und Körperzusammensetzung" />
<div class="stack">
  <RangePicker bind:range modes={['month', 'quarter', 'year', 'all']} />

  <div class="grid g3 stagger">
    <Card accent={COLORS.weight}>
      <div class="grid g2" style="gap:14px">
        <Stat label="Aktuell" value={num(latest?.v, 1)} unit="kg" color={COLORS.weight} sub={latest ? fmtDateTime(latest.t) : ''} />
        <Stat label="Veränderung" value={latest && first ? (latest.v - first.v >= 0 ? '+' : '') + num(latest.v - first.v, 1) : '–'} unit="kg" sub="im Zeitraum" />
        <Stat label="BMI" value={latest && height ? num(bmi(latest.v), 1) : '–'} sub={latest && height ? BMI_BANDS.find((b) => bmi(latest.v) >= b[0] && bmi(latest.v) < b[1])?.[2] : 'Größe im Profil fehlt'} />
        <Stat label="Messungen" value={num(pts.length)} />
      </div>
    </Card>
    <Card title="Gewicht eintragen" accent={COLORS.weight} class="span2">
      <form class="row wrap" onsubmit={(e) => { e.preventDefault(); add(); }}>
        <label class="field grow">Gewicht (kg)<input inputmode="decimal" bind:value={w} placeholder="z. B. 108,4" oninput={() => (confirmWarn = false)} /></label>
        <label class="field">Zeitpunkt<input type="datetime-local" bind:value={wt} /></label>
        <button class="btn primary" type="submit" style="align-self:flex-end">Speichern</button>
      </form>
      <p class="muted tiny" style="margin-top:10px">Waagen-Daten aus Health Connect (WeightRecord) erscheinen automatisch. Das aktuelle Gewicht im Profil kommt immer aus der letzten Messung.</p>
    </Card>
  </div>

  {#if loading && !weight}
    <Loading height={300} />
  {:else if !pts.length}
    <Card><Empty icon="⚖️" title="Keine Gewichtsmessungen im Zeitraum" text="Trage oben ein Gewicht ein oder wähle einen längeren Zeitraum." /></Card>
  {:else}
    <Card title="Gewichtsverlauf" subtitle="Einzelmessungen und gleitender 7-Tage-Durchschnitt" accent={COLORS.weight}>
      <div class="no-swipe"><Chart option={option} height={300} /></div>
    </Card>
  {/if}

  {#if height}
    <Card title="BMI-Einordnung" accent={COLORS.weight}>
      <div class="bmi">
        {#each BMI_BANDS as b}
          <div class="band" style="--bc:{b[3]}" class:cur={latest && bmi(latest.v) >= b[0] && bmi(latest.v) < b[1]}>
            <span class="bn">{b[2]}</span><span class="tiny muted">{b[1] >= 99 ? `≥ ${b[0]}` : b[0] ? `${num(b[0], 1)}–${num(b[1], 1)}` : `< ${b[1]}`}</span>
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  {#if fat?.points?.length}
    <Card title="Körperfett" accent="#f472b6">
      <Chart option={{ grid: grid(false), tooltip: { trigger: 'axis' }, xAxis: { type: 'time' }, yAxis: valueAxis(), series: [{ type: 'line', data: fat.points.map((p) => [p.t, +p.v.toFixed(1)]), smooth: 0.3, itemStyle: { color: '#f472b6' }, areaStyle: gradientArea('#f472b6') }] }} height={200} />
    </Card>
  {/if}
</div>

<style>
  .bmi { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .band { padding: 10px 8px; border-radius: 10px; border-top: 3px solid var(--bc); background: rgba(148, 163, 184, 0.05); display: flex; flex-direction: column; gap: 2px; opacity: 0.55; transition: all 0.2s; }
  .band.cur { opacity: 1; background: color-mix(in srgb, var(--bc) 14%, transparent); box-shadow: 0 0 0 1px var(--bc) inset; }
  .bn { font-size: 12.5px; font-weight: 650; }
  @media (max-width: 720px) { .bmi { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
