<script>
  // mobile hub pages ("Trends", "Mehr")
  import { app, href } from '../lib/state.svelte.js';
  import Icon from '../components/Icon.svelte';
  let { hub, pages } = $props();
  const DESC = {
    herz: 'Puls, Ruhepuls, Belastungszonen, HRV',
    schlaf: 'Nächte, Schlafphasen, Bewertung',
    aktivitaet: 'Schritte, Distanz, Kalorien, Training',
    vitalwerte: 'SpO₂, Atemfrequenz, Temperatur, Blutdruck',
    koerper: 'Gewicht, BMI, Körperfett',
    ph: 'pH-Messungen und Zielbereich',
    daten: 'Bearbeiten, Nachtragen, Protokoll, Rohdaten, Export',
    profil: 'Persönliche Daten, Ziele, Datenquellen',
  };
  const keys = $derived(hub === 'trends' ? ['herz', 'schlaf', 'aktivitaet', 'vitalwerte', 'koerper', 'ph'] : ['daten', 'profil']);
</script>

<div class="hub stagger">
  {#each keys as k}
    {@const p = pages[k]}
    <a class="item" href={href(k)} style="--c:{p.color}">
      <span class="ic"><Icon name={p.icon} size={22} /></span>
      <span class="grow"><b>{p.title}</b><span class="muted small">{DESC[k]}</span></span>
      <Icon name="chevron" size={18} />
    </a>
  {/each}
  {#if hub === 'mehr'}
    <a class="item" href={href('daten/export')} style="--c:#22d3ee">
      <span class="ic"><Icon name="download" size={22} /></span>
      <span class="grow"><b>Export</b><span class="muted small">CSV-Tageswerte und PDF-Bericht</span></span>
      <Icon name="chevron" size={18} />
    </a>
    <a class="item" href={href('daten/quellen')} style="--c:#a78bfa">
      <span class="ic"><Icon name="sources" size={22} /></span>
      <span class="grow"><b>Datenquellen &amp; Apps</b><span class="muted small">Sendestatus, Android-Apps herunterladen</span></span>
      <Icon name="chevron" size={18} />
    </a>
  {/if}
</div>

<style>
  .hub { display: flex; flex-direction: column; gap: 10px; }
  .item { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 16px; background: var(--panel); border: 1px solid var(--border); color: var(--text); }
  .item:active { background: var(--panel-hover); }
  .ic { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); flex: none; }
  .grow { display: flex; flex-direction: column; gap: 2px; }
  .item > :global(svg:last-child) { color: var(--faint); }
</style>
