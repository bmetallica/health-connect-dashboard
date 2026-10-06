<script>
  import { STATUS } from '../lib/theme.js';
  let { status = null, text = null } = $props();
</script>

{#if status}
  <span class="badge {status}">{STATUS[status].icon} {text ?? STATUS[status].label}</span>
{/if}
