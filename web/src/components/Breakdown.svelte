<script>
  // score breakdown rows: label, value, reference, bar
  import { STATUS } from '../lib/theme.js';
  let { items = [] } = $props();
</script>

<div class="bd">
  {#each items as b}
    <div class="r">
      <div class="top"><span>{b.label}{#if b.value}{' '}<b>{b.value}</b>{/if}</span><span class="muted tiny">Ziel {b.ref}</span></div>
      <div class="bar"><div style="width:{b.score}%;background:{STATUS[b.status]?.color || '#64748b'}"></div></div>
    </div>
  {/each}
</div>

<style>
  .bd { display: flex; flex-direction: column; gap: 12px; }
  .top { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin-bottom: 6px; }
  .top b { font-weight: 650; }
  .bar { height: 6px; border-radius: 6px; background: rgba(148, 163, 184, 0.12); overflow: hidden; }
  .bar div { height: 100%; border-radius: 6px; transform-origin: left; animation: grow 0.9s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes grow { from { transform: scaleX(0); } }
</style>
