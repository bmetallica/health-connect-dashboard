<script>
  let { label, value, unit = '', sub = '', color = null } = $props();
</script>

<div class="stat">
  <div class="l">{label}</div>
  <div class="v num" style={color ? `color:${color}` : ''}>{value}{#if unit}<span class="u">{unit}</span>{/if}</div>
  {#if sub}<div class="s">{sub}</div>{/if}
</div>

<style>
  .stat { min-width: 0; }
  .l { font-size: 11.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .v { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-top: 3px; white-space: nowrap; }
  .u { font-size: 13px; font-weight: 550; color: var(--muted); margin-left: 3px; }
  .s { font-size: 12px; color: var(--muted); margin-top: 2px; }
</style>
