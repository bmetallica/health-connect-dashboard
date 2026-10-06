<script>
  let { icon = '∅', title = 'Keine Daten', text = '', children } = $props();
</script>

<div class="empty">
  <div class="ic">{icon}</div>
  <div class="t">{title}</div>
  {#if text}<div class="muted small">{text}</div>{/if}
  {@render children?.()}
</div>

<style>
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; padding: 28px 12px; }
  .ic { font-size: 26px; width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: rgba(148, 163, 184, 0.08); margin-bottom: 4px; opacity: 0.85; }
  .t { font-weight: 650; }
  .small { max-width: 380px; }
</style>
