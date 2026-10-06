<script>
  import { fly } from 'svelte/transition';
  import { app } from '../lib/state.svelte.js';
</script>

<div class="toasts">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.kind}" transition:fly={{ y: 20, duration: 220 }}>
      <span class="i">{t.kind === 'err' ? '✕' : t.kind === 'warn' ? '!' : '✓'}</span>{t.text}
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; z-index: 120; left: 50%; transform: translateX(-50%); bottom: calc(24px + var(--safe-bottom)); display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 14px; background: rgba(24, 32, 57, 0.97); border: 1px solid var(--border-strong); box-shadow: var(--shadow); font-size: 13.5px; font-weight: 550; max-width: calc(100vw - 32px); }
  .i { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; background: rgba(52, 211, 153, 0.18); color: var(--ok); flex: none; }
  .err .i { background: rgba(248, 113, 113, 0.18); color: var(--crit); }
  .warn .i { background: rgba(251, 191, 36, 0.18); color: var(--warn); }
  @media (max-width: 960px) { .toasts { bottom: calc(86px + var(--safe-bottom)); } }
</style>
