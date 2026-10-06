<script>
  let { value = $bindable(), options = [] } = $props();
</script>

<div class="seg" role="tablist">
  {#each options as o}
    <button class:active={value === o.value} onclick={() => (value = o.value)} role="tab" aria-selected={value === o.value}>
      {#if o.color}<span class="dot" style="background:{o.color}"></span>{/if}{o.label}
    </button>
  {/each}
</div>

<style>
  .seg { display: inline-flex; flex-wrap: wrap; gap: 6px; }
  button { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border); background: rgba(148, 163, 184, 0.05); color: var(--muted); padding: 7px 13px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
  button:hover { color: var(--text); border-color: var(--border-strong); }
  button.active { color: var(--text); background: var(--panel-hover); border-color: rgba(148, 163, 184, 0.35); }
</style>
