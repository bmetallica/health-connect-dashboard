<script>
  let { height = 220, rows = 0 } = $props();
</script>

{#if rows}
  <div class="rows">{#each Array(rows) as _}<div class="skeleton" style="height:18px"></div>{/each}</div>
{:else}
  <div class="skeleton" style="height:{height}px"></div>
{/if}

<style>
  .rows { display: flex; flex-direction: column; gap: 10px; }
</style>
