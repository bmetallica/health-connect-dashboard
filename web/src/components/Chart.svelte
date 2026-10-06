<script>
  // ECharts wrapper: re-renders on option change, resizes with its container
  import { onMount } from 'svelte';
  import { echarts, reducedMotion } from '../lib/echarts.js';

  let { option, height = 260, onclick = null, class: cls = '' } = $props();
  let el;
  let chart = null;

  onMount(() => {
    chart = echarts.init(el, 'health', { renderer: 'canvas', locale: 'DE' });
    if (onclick) chart.on('click', (p) => onclick(p));
    const ro = new ResizeObserver(() => chart && chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chart = null;
    };
  });

  $effect(() => {
    if (!chart || !option) return;
    chart.setOption(
      { animationDuration: reducedMotion ? 0 : 700, animationEasing: 'cubicOut', animationDurationUpdate: reducedMotion ? 0 : 450, ...$state.snapshot(option) },
      { notMerge: true }
    );
  });
</script>

<div class="chart {cls}" bind:this={el} style="height:{typeof height === 'number' ? height + 'px' : height}"></div>

<style>
  .chart { width: 100%; min-width: 0; }
</style>
