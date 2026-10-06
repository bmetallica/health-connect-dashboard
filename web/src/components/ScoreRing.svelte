<script>
  // animated score ring (0-100), color by status; shows "–" without a score
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { STATUS } from '../lib/theme.js';

  let { score = null, status = null, size = 120, stroke = 10, label = '', color = null, sub = '' } = $props();
  const t = new Tween(0, { duration: 1100, easing: cubicOut });
  $effect(() => {
    t.target = score ?? 0;
  });
  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const col = $derived(color || (status ? STATUS[status].color : '#64748b'));
</script>

<div class="ring" style="width:{size}px;height:{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.12)" stroke-width={stroke} />
    <circle
      cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} stroke-width={stroke} stroke-linecap="round"
      stroke-dasharray={c} stroke-dashoffset={c * (1 - t.current / 100)} transform="rotate(-90 {size / 2} {size / 2})"
      style="filter: drop-shadow(0 0 6px {col}55)"
    />
  </svg>
  <div class="inner">
    <div class="val num" style="font-size:{Math.round(size * 0.28)}px">{score == null ? '–' : Math.round(t.current)}</div>
    {#if label}<div class="lbl" style="font-size:{Math.max(10, Math.round(size * 0.1))}px">{label}</div>{/if}
    {#if sub}<div class="lbl" style="font-size:{Math.max(9, Math.round(size * 0.085))}px;color:{col}">{sub}</div>{/if}
  </div>
</div>

<style>
  .ring { position: relative; flex: none; }
  .inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .val { font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  .lbl { color: var(--muted); margin-top: 3px; font-weight: 550; }
</style>
