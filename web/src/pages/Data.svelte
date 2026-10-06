<script>
  import { app, navigate } from '../lib/state.svelte.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import Edit from './data/Edit.svelte';
  import Log from './data/Log.svelte';
  import Raw from './data/Raw.svelte';
  import Export from './data/Export.svelte';
  import Sources from './data/Sources.svelte';

  const TABS = [
    { key: 'bearbeiten', label: 'Bearbeiten', icon: 'edit', c: Edit },
    { key: 'protokoll', label: 'Protokoll', icon: 'log', c: Log },
    { key: 'rohdaten', label: 'Rohdaten', icon: 'archive', c: Raw },
    { key: 'export', label: 'Export', icon: 'download', c: Export },
    { key: 'quellen', label: 'Datenquellen', icon: 'sources', c: Sources },
  ];
  const sub = $derived(app.route.path.split('/')[1] || 'bearbeiten');
  const tab = $derived(TABS.find((t) => t.key === sub) || TABS[0]);
</script>

<PageHead title="Daten" subtitle="Werte bearbeiten und nachtragen, Änderungen nachvollziehen, exportieren" />
<div class="tabs">
  {#each TABS as t}
    <button class:active={t.key === tab.key} onclick={() => navigate('daten/' + t.key)}><Icon name={t.icon} size={16} />{t.label}</button>
  {/each}
</div>
{#key tab.key}
  <div class="fade-in">
    <tab.c />
  </div>
{/key}

<style>
  .tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button { display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; padding: 10px 14px; color: var(--muted); font-weight: 600; font-size: 13.5px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
  .tabs button:hover { color: var(--text); }
  .tabs button.active { color: var(--text); border-bottom-color: var(--accent); }
</style>
