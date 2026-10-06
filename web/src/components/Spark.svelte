<script>
  // tiny inline sparkline (SVG), gaps for missing values
  let { values = [], color = '#22d3ee', width = 120, height = 34, fill = true } = $props();
  const pts = $derived.by(() => {
    const v = values.map((x) => (x == null || !Number.isFinite(x) ? null : x));
    const nums = v.filter((x) => x != null);
    if (nums.length < 2) return null;
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const span = hi - lo || 1;
    const step = width / Math.max(1, v.length - 1);
    const segs = [];
    let cur = [];
    v.forEach((x, i) => {
      if (x == null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push([i * step, height - 3 - ((x - lo) / span) * (height - 6)]);
    });
    if (cur.length) segs.push(cur);
    return segs;
  });
  const id = 'sp' + Math.random().toString(36).slice(2, 8);
</script>

{#if pts}
  <svg {width} {height} viewBox="0 0 {width} {height}" class="spark" preserveAspectRatio="none">
    <defs>
      <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color={color} stop-opacity="0.35" />
        <stop offset="1" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    {#each pts as seg}
      {#if fill && seg.length > 1}
        <path d={'M' + seg.map((p) => p.join(',')).join('L') + `L${seg[seg.length - 1][0]},${height}L${seg[0][0]},${height}Z`} fill="url(#{id})" />
      {/if}
      <path d={'M' + seg.map((p) => p.join(',')).join('L')} fill="none" stroke={color} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" class="line" vector-effect="non-scaling-stroke" />
    {/each}
  </svg>
{/if}

<style>
  .spark { display: block; overflow: visible; }
  .line { stroke-dasharray: 600; stroke-dashoffset: 600; animation: draw 1.2s ease forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
</style>
