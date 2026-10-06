<script>
  let { title = '', subtitle = '', accent = null, icon = '', pad = true, class: cls = '', actions, children, onclick = null } = $props();
</script>

<section class="card {cls}" class:click={!!onclick} style={accent ? `--card-accent:${accent}` : ''} onclick={onclick} role={onclick ? 'button' : undefined} tabindex={onclick ? 0 : undefined} onkeydown={(e) => onclick && e.key === 'Enter' && onclick(e)}>
  {#if title || actions}
    <header>
      <div class="t">
        {#if icon}<span class="ic">{icon}</span>{/if}
        <div>
          {#if title}<h3>{title}</h3>{/if}
          {#if subtitle}<div class="sub">{subtitle}</div>{/if}
        </div>
      </div>
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </header>
  {/if}
  <div class:pad>{@render children?.()}</div>
</section>

<style>
  .card {
    position: relative;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 40%), var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 0;
    overflow: hidden;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .card::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: var(--card-accent, transparent);
    opacity: 0.7;
  }
  .card.click { cursor: pointer; }
  .card.click:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: var(--shadow); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 18px 0; }
  .t { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ic { font-size: 16px; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--card-accent, #94a3b8) 16%, transparent); flex: none; }
  h3 { font-size: 14px; font-weight: 650; color: var(--text); }
  .sub { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .pad { padding: 14px 18px 18px; }
  @media (max-width: 720px) { header { padding: 14px 14px 0; } .pad { padding: 12px 14px 14px; } }
</style>
