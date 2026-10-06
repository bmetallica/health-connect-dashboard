<script>
  import { get, download } from '../lib/api.js';
  import { COLORS, alpha } from '../lib/theme.js';
  import { num, fmtDay } from '../lib/format.js';
  import { grid, valueAxis } from '../lib/charts.js';
  import PageHead from '../components/PageHead.svelte';
  import RangePicker from '../components/RangePicker.svelte';
  import Card from '../components/Card.svelte';
  import Chart from '../components/Chart.svelte';
  import Empty from '../components/Empty.svelte';
  import Loading from '../components/Loading.svelte';
  import Icon from '../components/Icon.svelte';

  let range = $state({ mode: 'quarter' });
  let data = $state(null);
  let loading = $state(true);
  let onlyReliable = $state(false);

  $effect(() => {
    if (!range.from) return;
    const { from, to } = range;
    loading = true;
    get('/analysis', { from, to }).then((d) => {
      if (range.from !== from || range.to !== to) return;
      data = d;
      loading = false;
    });
  });

  const MCOL = { ph: COLORS.ph, sleep: COLORS.sleep, steps: COLORS.steps, resting: COLORS.resting, hr: COLORS.hr, spo2: COLORS.spo2, hrv: COLORS.hrv, weight: COLORS.weight, kcal: COLORS.kcal };
  const STRENGTH = { kein: 'neutral', schwach: 'neutral', 'mäßig': 'info', stark: 'ok' };
  const corr = $derived((data?.correlations || []).filter((f) => !onlyReliable || (f.reliable && Math.abs(f.r) >= 0.3)));
  const tagFx = $derived((data?.tags || []).filter((f) => !onlyReliable || f.reliable));

  function scatter(f) {
    const xs = f.points.map((p) => p.x);
    const ys = f.points.map((p) => p.y);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
    }
    const k = sxx ? sxy / sxx : 0;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const col = MCOL[f.y] || COLORS.accent;
    return {
      grid: grid(false, { top: 10, left: 4, right: 8 }),
      tooltip: { trigger: 'item', formatter: (p) => p.seriesType === 'scatter' ? `${fmtDay(p.data.day, { year: true })}<br>${f.xLabel}: <b>${num(p.value[0], 1)}</b><br>${f.yLabel}: <b>${num(p.value[1], 2)}</b>` : '' },
      xAxis: { type: 'value', scale: true, splitLine: { show: false }, axisLabel: { color: '#64748b', fontSize: 10, hideOverlap: true, formatter: (v) => v.toLocaleString('de-DE') } },
      yAxis: valueAxis({ axisLabel: { color: '#64748b', fontSize: 10 } }),
      series: [
        { type: 'scatter', symbolSize: 8, data: f.points.map((p) => ({ value: [p.x, p.y], day: p.day })), itemStyle: { color: alpha(col, 0.75), borderColor: col } },
        { type: 'line', silent: true, showSymbol: false, data: [[x0, my + k * (x0 - mx)], [x1, my + k * (x1 - mx)]], lineStyle: { color: '#e2e8f0', width: 1.5, type: 'dashed', opacity: 0.6 } },
      ],
    };
  }
</script>

<PageHead title="Analyse" subtitle="Zusammenhänge zwischen deinen Werten, Tags und Bericht">
  {#snippet actions()}
    <button class="btn" onclick={() => download('/export.csv', { from: range.from, to: range.to })}><Icon name="download" size={16} /> CSV</button>
    <button class="btn primary" onclick={() => download('/report.pdf', { from: range.from, to: range.to })}><Icon name="file" size={16} /> PDF-Bericht</button>
  {/snippet}
</PageHead>

<div class="stack">
  <div class="row wrap between">
    <RangePicker bind:range modes={['month', 'quarter', 'year', 'all']} />
    <label class="row small muted toggle"><input type="checkbox" bind:checked={onlyReliable} /> nur belastbare Zusammenhänge</label>
  </div>

  <div class="info">
    <Icon name="info" size={18} />
    <span>Ein Zusammenhang gilt als belastbar ab <b>14 gemeinsamen Tagen</b> und mindestens mäßiger Stärke (|r| ≥ 0,3). Er zeigt eine statistische Auffälligkeit, keine Ursache – und ist keine medizinische Diagnose. Mit Tags im Tagebuch werden Tag-Effekte sichtbar.</span>
  </div>

  {#if loading && !data}
    <div class="grid g3"><Loading height={260} /><Loading height={260} /><Loading height={260} /></div>
  {:else}
    {#if corr.length}
      <div class="grid g3 stagger">
        {#each corr as f (f.y + f.x + f.lag)}
          <Card accent={MCOL[f.y]}>
            <div class="ch">
              <div class="pair"><span style="color:{MCOL[f.y]}">{f.yLabel}</span><span class="muted">↔</span><span style="color:{MCOL[f.x]}">{f.xLabel}</span></div>
              <span class="badge {STRENGTH[f.strength]}">{f.strength}{f.strength !== 'kein' ? (f.r >= 0 ? ' +' : ' −') : ''}</span>
            </div>
            <div class="no-swipe"><Chart option={scatter(f)} height={170} /></div>
            <p class="txt">{f.text}</p>
            <div class="meta tiny muted">r = {num(f.r, 2)} · {f.n} Tage{#if !f.reliable} · <span style="color:var(--warn)">zu wenige Daten</span>{/if}</div>
          </Card>
        {/each}
      </div>
    {:else}
      <Card><Empty icon="📈" title="Noch keine Zusammenhänge" text="Für Zusammenhänge werden mindestens 5 Tage benötigt, an denen beide Werte vorliegen. Wähle einen längeren Zeitraum." /></Card>
    {/if}

    <Card title="Einfluss deiner Tags" subtitle="Durchschnitt an Tagen mit Tag (bzw. am Folgetag) im Vergleich zu Tagen ohne" icon="🏷️" accent={COLORS.journal}>
      {#if tagFx.length}
        <div class="fx">
          {#each tagFx as f}
            <div class="fxr">
              <span class="chip"><span class="dot" style="background:{f.color}"></span>{f.tag}</span>
              <span class="grow">{f.text}</span>
              {#if !f.reliable}<span class="badge warn">wenige Tage</span>{/if}
            </div>
          {/each}
        </div>
      {:else}
        <Empty icon="🏷️" title="Noch keine Tag-Effekte" text="Vergib im Tagebuch Tags wie „Alkohol“, „Sport“ oder „Stress“. Ab 2 markierten Tagen wird der Einfluss auf pH, Schlaf, Ruhepuls und Schritte berechnet." />
      {/if}
    </Card>
  {/if}
</div>

<style>
  .toggle { cursor: pointer; gap: 8px; }
  .toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
  .info { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; background: rgba(129, 140, 248, 0.07); border: 1px solid rgba(129, 140, 248, 0.2); font-size: 13px; color: var(--text-2); }
  .info :global(svg) { color: #818cf8; margin-top: 1px; }
  .ch { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
  .pair { display: flex; flex-wrap: wrap; gap: 0 6px; font-weight: 650; font-size: 13.5px; }
  .txt { font-size: 13px; margin-top: 6px; color: var(--text-2); }
  .meta { margin-top: 6px; }
  .fx { display: flex; flex-direction: column; gap: 10px; }
  .fxr { display: flex; align-items: center; gap: 12px; font-size: 13.5px; padding: 10px 12px; border-radius: 12px; background: rgba(148, 163, 184, 0.04); flex-wrap: wrap; }
</style>
