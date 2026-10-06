<script>
  // unified range selector: Tag / Woche / Monat / Jahr / Alles / eigener Zeitraum.
  // Week/month/year are rolling windows ending at the anchor day; arrows and
  // horizontal swipes move by one window.
  import { onMount } from 'svelte';
  import { app } from '../lib/state.svelte.js';
  import { today, addDays, fmtDay, daysBetween } from '../lib/format.js';

  let { range = $bindable(), modes = ['day', 'week', 'month', 'year', 'all'] } = $props();
  const LEN = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };
  const LABELS = { day: 'Tag', week: 'Woche', month: 'Monat', quarter: '90 T', year: 'Jahr', all: 'Alles', custom: 'Eigener' };

  let mode = $state(range?.mode || 'week');
  let anchor = $state(range?.to || today());
  let cFrom = $state(range?.from || addDays(today(), -29));
  let cTo = $state(range?.to || today());

  function compute() {
    if (mode === 'all') {
      const r = app.meta?.range || {};
      return { mode, from: r.first || addDays(today(), -365), to: r.last && r.last > today() ? r.last : today() };
    }
    if (mode === 'custom') return { mode, from: cFrom <= cTo ? cFrom : cTo, to: cFrom <= cTo ? cTo : cFrom };
    return { mode, from: addDays(anchor, -(LEN[mode] - 1)), to: anchor };
  }
  $effect(() => {
    const r = compute();
    if (!range || r.from !== range.from || r.to !== range.to || r.mode !== range.mode) range = r;
  });

  function shift(dir) {
    if (mode === 'all') return;
    if (mode === 'custom') {
      const len = daysBetween(cFrom, cTo) + 1;
      cFrom = addDays(cFrom, dir * len);
      cTo = addDays(cTo, dir * len);
      return;
    }
    const next = addDays(anchor, dir * LEN[mode]);
    anchor = next > today() ? today() : next;
  }
  function setMode(m) {
    if (m === 'custom') {
      const r = compute();
      cFrom = r.from;
      cTo = r.to;
    }
    mode = m;
  }
  const atEnd = $derived(mode !== 'custom' && mode !== 'all' && anchor >= today());
  const label = $derived.by(() => {
    const r = range || compute();
    if (r.from === r.to) return r.to === today() ? 'Heute' : fmtDay(r.to, { year: true });
    return `${fmtDay(r.from, { weekday: false })} – ${fmtDay(r.to, { weekday: false, year: true })}`;
  });

  onMount(() => {
    let sx = 0, sy = 0, ok = false;
    const start = (e) => {
      const t = e.touches[0];
      ok = !e.target.closest('.no-swipe, input, textarea, select, .sheet');
      sx = t.clientX;
      sy = t.clientY;
    };
    const end = (e) => {
      if (!ok) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) > 80 && Math.abs(dy) < 50) shift(dx < 0 ? 1 : -1);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchend', end);
    };
  });
</script>

<div class="rp">
  <div class="modes" role="tablist">
    {#each [...modes, 'custom'] as m}
      <button class:active={mode === m} onclick={() => setMode(m)} role="tab" aria-selected={mode === m}>{LABELS[m]}</button>
    {/each}
  </div>
  <div class="nav">
    {#if mode === 'custom'}
      <input type="date" bind:value={cFrom} max={today()} />
      <span class="muted">–</span>
      <input type="date" bind:value={cTo} max={today()} />
    {:else}
      <button class="btn icon ghost" onclick={() => shift(-1)} disabled={mode === 'all'} aria-label="Zurück">‹</button>
      <span class="label num">{label}</span>
      <button class="btn icon ghost" onclick={() => shift(1)} disabled={atEnd || mode === 'all'} aria-label="Vor">›</button>
      {#if !atEnd && mode !== 'all'}
        <button class="btn sm" onclick={() => (anchor = today())}>Heute</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .rp { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; }
  .modes { display: inline-flex; background: rgba(148, 163, 184, 0.07); border: 1px solid var(--border); border-radius: 12px; padding: 3px; gap: 2px; overflow-x: auto; max-width: 100%; }
  .modes button { border: 0; background: transparent; color: var(--muted); padding: 6px 12px; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 600; white-space: nowrap; transition: background 0.15s, color 0.15s; }
  .modes button:hover { color: var(--text); }
  .modes button.active { background: var(--panel-hover); color: var(--text); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
  .nav { display: flex; align-items: center; gap: 6px; }
  .nav .btn.icon { font-size: 20px; line-height: 1; }
  .label { font-weight: 600; min-width: 120px; text-align: center; font-size: 13.5px; }
  .nav input { padding: 6px 8px; font-size: 13px; }
  @media (max-width: 720px) { .rp { flex-direction: column; align-items: stretch; } .nav { justify-content: center; } .modes { justify-content: space-between; } .modes button { flex: 1; padding: 7px 6px; } }
</style>
