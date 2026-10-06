<script>
  import { get, post } from '../lib/api.js';
  import { toast, href } from '../lib/state.svelte.js';
  import { COLORS, STATUS, alpha } from '../lib/theme.js';
  import { num, dayStart, addDays, fmtDay, fmtTime, dayKey, nowLocalInput, parseNumber, fmtDateTime } from '../lib/format.js';
  import { valueAxis, grid, timeAxisLabels } from '../lib/charts.js';
  import PageHead from '../components/PageHead.svelte';
  import RangePicker from '../components/RangePicker.svelte';
  import Card from '../components/Card.svelte';
  import Chart from '../components/Chart.svelte';
  import Stat from '../components/Stat.svelte';
  import ScoreRing from '../components/ScoreRing.svelte';
  import Breakdown from '../components/Breakdown.svelte';
  import Status from '../components/Status.svelte';
  import Empty from '../components/Empty.svelte';
  import Loading from '../components/Loading.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Icon from '../components/Icon.svelte';

  let range = $state({ mode: 'month' });
  let sum = $state(null);
  let rows = $state([]);
  let loading = $state(true);
  let reload = $state(0);
  let addOpen = $state(false);
  let newVal = $state('');
  let newTime = $state(nowLocalInput());
  let warned = $state(false);

  $effect(() => {
    if (!range.from) return;
    reload;
    const { from, to } = range;
    loading = true;
    Promise.all([get('/summary', { from, to }), get('/edit/samples/ph', { from, to, size: 500 })]).then(([s, r]) => {
      if (range.from !== from || range.to !== to) return;
      sum = s;
      rows = r.items.filter((x) => !x.deleted);
      loading = false;
    });
  });

  const ph = $derived(sum?.ph);
  const target = $derived(sum?.derived?.phTarget);
  const days = $derived(sum?.days || []);
  const dev = (v) => (!target ? null : v < target.min ? v - target.min : v > target.max ? v - target.max : 0);
  const stat = (v) => {
    const d = dev(v);
    if (d == null) return null;
    return Math.abs(d) <= 0.2 ? 'ok' : Math.abs(d) <= 0.5 ? 'warn' : 'crit';
  };
  const sorted = $derived([...rows].sort((a, b) => a.time - b.time));

  const option = $derived.by(() => {
    if (!sorted.length) return null;
    const span = dayStart(addDays(range.to, 1)) - dayStart(range.from);
    const vals = sorted.map((r) => r.value);
    return {
      grid: grid(false, { top: 32 }),
      legend: { top: 0, right: 0, data: ['Messung', 'Ø pro Tag'] },
      tooltip: {
        trigger: 'item',
        formatter: (p) => p.seriesName === 'Messung'
          ? `${fmtDateTime(p.value[0])}<br><b>pH ${num(p.value[1], 1)}</b>${target ? `<br>${dev(p.value[1]) === 0 ? 'im Zielbereich' : 'Abweichung ' + (dev(p.value[1]) > 0 ? '+' : '') + num(dev(p.value[1]), 1)}` : ''}`
          : `${fmtDay(dayKey(p.value[0]), { year: true })}<br>Ø <b>${num(p.value[1], 2)}</b>`,
      },
      xAxis: { type: 'time', min: dayStart(range.from), max: Math.min(Date.now(), dayStart(addDays(range.to, 1))), axisLabel: timeAxisLabels(span) },
      yAxis: valueAxis({ min: (v) => Math.max(0, Math.floor(Math.min(v.min, target?.min ?? 99) - 0.5)), max: (v) => Math.ceil(Math.max(v.max, target?.max ?? 0) + 0.5) }),
      series: [
        {
          name: 'Ø pro Tag', type: 'line', showSymbol: false, lineStyle: { width: 2, color: alpha(COLORS.ph, 0.6) }, itemStyle: { color: alpha(COLORS.ph, 0.6) },
          data: days.filter((d) => d.phAvg != null).map((d) => [dayStart(d.day) + 43200000, +d.phAvg.toFixed(2)]),
          markArea: target ? {
            silent: true,
            data: [
              [{ yAxis: target.min - 0.2, itemStyle: { color: 'rgba(52,211,153,0.05)' } }, { yAxis: target.max + 0.2 }],
              [{ yAxis: target.min, itemStyle: { color: 'rgba(52,211,153,0.12)' }, label: { show: true, position: 'insideTopLeft', color: '#34d399', fontSize: 10, formatter: 'Zielbereich' } }, { yAxis: target.max }],
            ],
          } : undefined,
        },
        {
          name: 'Messung', type: 'scatter', symbolSize: 11, itemStyle: { color: COLORS.ph },
          data: sorted.map((r) => ({ value: [r.time, r.value], itemStyle: { color: r.edited || r.manual ? '#e2e8f0' : stat(r.value) ? STATUS[stat(r.value)].color : COLORS.ph, borderColor: '#0b1020', borderWidth: 1.5 } })),
        },
      ],
    };
  });

  const histOption = $derived.by(() => {
    if (!sorted.length) return null;
    const bins = new Map();
    for (const r of sorted) {
      const b = Math.round(r.value * 2) / 2;
      if (b < 0 || b > 14) continue;
      bins.set(b, (bins.get(b) || 0) + 1);
    }
    const keys = [...bins.keys()].sort((a, b) => a - b);
    const all = [];
    if (keys.length) for (let k = keys[0]; k <= keys[keys.length - 1] + 1e-9; k += 0.5) all.push(+k.toFixed(1));
    return {
      grid: grid(false),
      tooltip: { trigger: 'axis', formatter: (ps) => `pH ${num(+ps[0].name, 1)}: <b>${ps[0].value} Messungen</b>` },
      xAxis: { type: 'category', data: all.map(String), axisLabel: { formatter: (v) => num(+v, 1) } },
      yAxis: valueAxis({ min: 0, minInterval: 1 }),
      series: [{ type: 'bar', barMaxWidth: 30, data: all.map((k) => ({ value: bins.get(k) || 0, itemStyle: { color: stat(k) ? STATUS[stat(k)].color : COLORS.ph, borderRadius: [6, 6, 2, 2] } })) }],
    };
  });

  async function addMeasurement() {
    const v = parseNumber(newVal);
    if (!Number.isFinite(v)) return toast('Bitte einen Wert eingeben', 'err');
    if ((v < 4 || v > 9) && !warned) {
      warned = true;
      return;
    }
    try {
      await post('/edit/samples', { type: 'ph', value: v, time: newTime });
      toast('Messung nachgetragen');
      addOpen = false;
      newVal = '';
      warned = false;
      reload++;
    } catch (e) {
      toast(e.message, 'err');
    }
  }
</script>

<PageHead title="pH-Wert" subtitle="Messungen mit Teststreifen im Vergleich zum Zielbereich">
  {#snippet actions()}
    <button class="btn" onclick={() => { newTime = nowLocalInput(); addOpen = true; }}><Icon name="plus" size={16} /> Nachtragen</button>
  {/snippet}
</PageHead>
<div class="stack">
  <RangePicker bind:range modes={['week', 'month', 'quarter', 'year', 'all']} />

  {#if loading && !sum}
    <Loading height={320} />
  {:else if !rows.length}
    <Card><Empty icon="🧪" title="Keine pH-Messungen im Zeitraum" /></Card>
  {:else}
    <div class="stagger stack">
      <div class="grid g2">
        <Card accent={COLORS.ph}>
          <div class="statrow">
            <ScoreRing score={ph?.total} status={ph?.status} size={104} stroke={9} label="pH" />
            <div class="grid sg">
              <Stat label="Letzte Messung" value={num(ph?.latest?.value, 1)} sub={ph?.latest ? fmtDateTime(ph.latest.time) : ''} color={ph?.latest?.status ? STATUS[ph.latest.status].color : COLORS.ph} />
              <Stat label="Ø / Median" value={`${num(ph?.avg, 2)} / ${num(ph?.median, 1)}`} />
              <Stat label="Spanne" value={`${num(ph?.min, 1)} – ${num(ph?.max, 1)}`} />
              <Stat label="Im Zielbereich" value={ph?.pctWithin != null ? num(ph.pctWithin) : '–'} unit={ph?.pctWithin != null ? '%' : ''} sub={target ? `Ziel ${num(target.min, 1)}–${num(target.max, 1)} (±0,2)` : 'Zielbereich im Profil festlegen'} />
            </div>
          </div>
        </Card>
        <Card title="Bewertung" accent={COLORS.ph}>
          {#if ph?.breakdown}
            <Breakdown items={ph.breakdown} />
          {:else}
            <p class="muted small">Für eine Bewertung werden ein Zielbereich im <a href={href('profil')}>Profil</a> und mindestens 3 Messungen benötigt.</p>
          {/if}
        </Card>
      </div>

      <Card title="Verlauf" subtitle="Punkte: Einzelmessungen (weiß = korrigiert/nachgetragen) · Linie: Tagesdurchschnitt" accent={COLORS.ph}>
        <div class="no-swipe"><Chart option={option} height={320} /></div>
      </Card>

      <div class="grid g2">
        <Card title="Verteilung der Werte" subtitle="Anzahl Messungen je 0,5 pH-Stufe" accent={COLORS.ph}>
          <Chart option={histOption} height={220} />
        </Card>
        <Card title="Messungen" subtitle={`${rows.length} im Zeitraum`} accent={COLORS.ph}>
          {#snippet actions()}<a class="btn sm ghost" href={href('daten/bearbeiten', { kind: 'ph', from: range.from, to: range.to })}><Icon name="edit" size={15} /> Bearbeiten</a>{/snippet}
          <div class="table-wrap scroll">
            <table class="list">
              <thead><tr><th>Datum</th><th>Uhrzeit</th><th>Wert</th><th>Abw.</th><th></th></tr></thead>
              <tbody>
                {#each rows as r}
                  {@const d = dev(r.value)}
                  <tr>
                    <td>{fmtDay(r.day)}</td>
                    <td class="num">{fmtTime(r.time)}{#if r.receivedAt && Math.abs(r.receivedAt - r.time) > 120000}<span class="faint tiny"> (Eingang {fmtTime(r.receivedAt)})</span>{/if}</td>
                    <td class="num"><b>{num(r.value, 1)}</b>{#if r.edited}<span class="faint tiny"> statt {num(r.rawValue, 1)}</span>{/if}</td>
                    <td class="num">{d == null ? '–' : d === 0 ? '✓' : (d > 0 ? '+' : '') + num(d, 1)}</td>
                    <td><Status status={stat(r.value)} />{#if r.manual}<span class="badge neutral" style="margin-left:4px">manuell</span>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  {/if}
</div>

<Sheet bind:open={addOpen} title="pH-Messung nachtragen" width={420}>
  <form class="stack" onsubmit={(e) => { e.preventDefault(); addMeasurement(); }}>
    <label class="field">pH-Wert<input inputmode="decimal" bind:value={newVal} placeholder="z. B. 6,8" oninput={() => (warned = false)} /></label>
    <label class="field">Zeitpunkt<input type="datetime-local" bind:value={newTime} /></label>
    {#if warned}<div class="warnbox">pH {newVal} liegt außerhalb des üblichen Bereichs (4–9). Trotzdem speichern?</div>{/if}
    <button class="btn primary" type="submit">{warned ? 'Trotzdem speichern' : 'Speichern'}</button>
  </form>
</Sheet>

<style>
  .statrow { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .sg { flex: 1; min-width: 240px; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scroll { max-height: 300px; overflow-y: auto; }
  .warnbox { padding: 10px 12px; border-radius: 10px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: var(--warn); font-size: 13px; }
</style>
