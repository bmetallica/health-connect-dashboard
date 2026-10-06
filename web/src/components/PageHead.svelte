<script>
  let { title, subtitle = '', actions } = $props();
</script>

<div class="ph">
  <div class="tt">
    <h1>{title}</h1>
    {#if subtitle}<div class="muted sub">{subtitle}</div>{/if}
  </div>
  {#if actions}<div class="ac">{@render actions()}</div>{/if}
</div>

<style>
  .ph { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; margin-bottom: 20px; }
  .sub { margin-top: 4px; font-size: 13.5px; }
  .ac { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  @media (max-width: 960px) { .tt h1 { display: none; } .ph { margin-bottom: 14px; } .sub { margin-top: 0; } }
</style>
