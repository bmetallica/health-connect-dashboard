<script>
  // dialog: centered on desktop, bottom sheet on mobile
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  let { open = $bindable(false), title = '', width = 520, children, footer } = $props();
  const mobile = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches;
  function onkey(e) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window onkeydown={onkey} />

{#if open}
  <div class="backdrop" transition:fade={{ duration: 180 }} onclick={() => (open = false)} role="presentation"></div>
  <div class="sheet" style="--w:{width}px" role="dialog" aria-modal="true" aria-label={title}
    transition:fly={mobile ? { y: 400, duration: 280, easing: cubicOut, opacity: 1 } : { y: 16, duration: 220, easing: cubicOut }}>
    <div class="grab"></div>
    <header>
      <h2>{title}</h2>
      <button class="btn icon ghost" onclick={() => (open = false)} aria-label="Schließen">✕</button>
    </header>
    <div class="body">{@render children?.()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(2, 6, 18, 0.65); backdrop-filter: blur(3px); z-index: 90; }
  .sheet {
    position: fixed; z-index: 91; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(var(--w), calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column;
    background: var(--panel); border: 1px solid var(--border-strong); border-radius: 20px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  }
  .grab { display: none; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 6px; }
  header h2 { font-size: 17px; }
  .body { padding: 8px 18px 18px; overflow-y: auto; }
  footer { padding: 12px 18px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  @media (max-width: 720px) {
    .sheet { left: 0; right: 0; top: auto; bottom: 0; transform: none; width: 100%; max-height: 88vh; border-radius: 22px 22px 0 0; padding-bottom: var(--safe-bottom); }
    .grab { display: block; width: 40px; height: 4px; border-radius: 4px; background: rgba(148, 163, 184, 0.3); margin: 8px auto 0; }
    header { padding-top: 8px; }
  }
</style>
