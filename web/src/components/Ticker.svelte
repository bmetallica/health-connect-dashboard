<script>
  // number that counts up/down to its value
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { num } from '../lib/format.js';
  let { value = null, digits = 0 } = $props();
  const t = new Tween(0, { duration: 900, easing: cubicOut });
  $effect(() => {
    if (value != null && Number.isFinite(value)) t.target = value;
  });
</script>

<span class="num">{value == null || !Number.isFinite(value) ? '–' : num(t.current, digits)}</span>
