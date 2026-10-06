<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { app, initRouter, loadMeta, href } from './lib/state.svelte.js';
  import { COLORS } from './lib/theme.js';
  import { timeAgo } from './lib/format.js';
  import Icon from './components/Icon.svelte';
  import Toasts from './components/Toasts.svelte';
  import Today from './pages/Today.svelte';
  import Heart from './pages/Heart.svelte';
  import Sleep from './pages/Sleep.svelte';
  import Activity from './pages/Activity.svelte';
  import Vitals from './pages/Vitals.svelte';
  import Body from './pages/Body.svelte';
  import Ph from './pages/Ph.svelte';
  import Journal from './pages/Journal.svelte';
  import Analysis from './pages/Analysis.svelte';
  import Data from './pages/Data.svelte';
  import Profile from './pages/Profile.svelte';
  import Hub from './pages/Hub.svelte';

  const PAGES = {
    heute: { c: Today, title: 'Heute', icon: 'today', color: COLORS.accent },
    herz: { c: Heart, title: 'Herz', icon: 'heart', color: COLORS.hr, group: 'trends' },
    schlaf: { c: Sleep, title: 'Schlaf', icon: 'moon', color: COLORS.sleep, group: 'trends' },
    aktivitaet: { c: Activity, title: 'Aktivität', icon: 'activity', color: COLORS.activity, group: 'trends' },
    vitalwerte: { c: Vitals, title: 'Vitalwerte', icon: 'vitals', color: COLORS.spo2, group: 'trends' },
    koerper: { c: Body, title: 'Körper', icon: 'body', color: COLORS.body, group: 'trends' },
    ph: { c: Ph, title: 'pH-Wert', icon: 'flask', color: COLORS.ph, group: 'trends' },
    tagebuch: { c: Journal, title: 'Tagebuch', icon: 'book', color: COLORS.journal },
    analyse: { c: Analysis, title: 'Analyse', icon: 'chart', color: '#818cf8' },
    daten: { c: Data, title: 'Daten', icon: 'data', color: '#94a3b8', group: 'mehr' },
    profil: { c: Profile, title: 'Profil', icon: 'user', color: '#94a3b8', group: 'mehr' },
    trends: { c: Hub, title: 'Trends', icon: 'trends', hub: 'trends' },
    mehr: { c: Hub, title: 'Mehr', icon: 'more', hub: 'mehr' },
  };
  const SIDEBAR = [
    { items: ['heute'] },
    { title: 'Trends', items: ['herz', 'schlaf', 'aktivitaet', 'vitalwerte', 'koerper', 'ph'] },
    { title: 'Auswerten', items: ['tagebuch', 'analyse'] },
    { title: 'Verwaltung', items: ['daten', 'profil'] },
  ];
  const BOTTOM = ['heute', 'trends', 'tagebuch', 'analyse', 'mehr'];

  let collapsed = $state(false);
  try {
    collapsed = localStorage.getItem('sidebar') === '1';
  } catch {}
  function toggle() {
    collapsed = !collapsed;
    try {
      localStorage.setItem('sidebar', collapsed ? '1' : '0');
    } catch {}
  }

  const base = $derived(app.route.path.split('/')[0]);
  const page = $derived(PAGES[base] || PAGES.heute);
  const bottomActive = $derived(page.group || base);
  const lastSync = $derived.by(() => {
    const s = app.meta?.lastBySource || {};
    const ts = Object.values(s).map((x) => Date.parse(x.last)).filter(Boolean);
    return ts.length ? Math.max(...ts) : null;
  });
  const ing = $derived(app.meta?.ingest);

  onMount(() => {
    initRouter();
    loadMeta();
    const t = setInterval(loadMeta, 60000);
    return () => clearInterval(t);
  });

  $effect(() => {
    document.title = `${page.title} · Gesundheit`;
  });
  $effect(() => {
    app.route.path;
    window.scrollTo({ top: 0 });
  });
</script>

<div class="shell" class:collapsed>
  <aside class="sidebar">
    <div class="brand">
      <img src="/icon.svg" alt="" width="30" height="30" />
      {#if !collapsed}<span>Gesundheit</span>{/if}
      <button class="btn icon ghost collapse" onclick={toggle} title={collapsed ? 'Ausklappen' : 'Einklappen'}><Icon name="sidebar" size={18} /></button>
    </div>
    <nav>
      {#each SIDEBAR as g}
        {#if g.title && !collapsed}<div class="gt">{g.title}</div>{/if}
        {#if g.title && collapsed}<div class="sep"></div>{/if}
        {#each g.items as key}
          {@const p = PAGES[key]}
          <a href={href(key)} class:active={base === key} style="--c:{p.color}" title={collapsed ? p.title : undefined}>
            <span class="ni"><Icon name={p.icon} size={19} /></span>
            {#if !collapsed}<span>{p.title}</span>{/if}
          </a>
        {/each}
      {/each}
    </nav>
    {#if !collapsed}
      <div class="sync">
        <span class="dot" style="background:{lastSync && Date.now() - lastSync < 6 * 3600000 ? 'var(--ok)' : 'var(--faint)'}"></span>
        Letzte Daten {timeAgo(lastSync)}
      </div>
    {/if}
  </aside>

  <div class="main-col">
    <header class="mobile-head">
      <div class="mh-title">
        <span class="mh-ic" style="color:{page.color || 'var(--accent)'}"><Icon name={page.icon} size={20} /></span>
        <h1>{page.title}</h1>
      </div>
      <span class="tiny muted">{timeAgo(lastSync)}</span>
    </header>

    {#if ing?.running}
      <div class="banner" transition:fade>
        <Icon name="sync" size={16} /> Daten werden verarbeitet … {ing.done} / {ing.backlog}
        <div class="pbar"><div style="width:{ing.backlog ? (ing.done / ing.backlog) * 100 : 0}%"></div></div>
      </div>
    {/if}
    {#if app.metaError && !app.meta}
      <div class="banner err">Server nicht erreichbar: {app.metaError}</div>
    {/if}

    <main>
      {#key base}
        <div class="page fade-in">
          {#if app.meta}
            {@const C = page.c}
            <C hub={page.hub} pages={PAGES} />
          {:else}
            <div class="boot"><div class="skeleton" style="height:140px"></div><div class="skeleton" style="height:260px"></div></div>
          {/if}
        </div>
      {/key}
    </main>
  </div>

  <nav class="bottom">
    {#each BOTTOM as key}
      {@const p = PAGES[key]}
      <a href={href(key)} class:active={bottomActive === key}>
        <Icon name={p.icon} size={22} />
        <span>{p.title}</span>
      </a>
    {/each}
  </nav>
</div>

<Toasts />

<style>
  .shell { display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr); min-height: 100vh; transition: grid-template-columns 0.25s ease; }
  .shell.collapsed { grid-template-columns: 76px minmax(0, 1fr); }
  .sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; padding: 18px 12px; border-right: 1px solid var(--border); background: rgba(11, 16, 32, 0.6); backdrop-filter: blur(12px); overflow-y: auto; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 2px 8px 18px; font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
  .brand img { border-radius: 9px; }
  .collapse { margin-left: auto; color: var(--muted); }
  .collapsed .brand { flex-direction: column; padding: 2px 0 14px; }
  .collapsed .collapse { margin: 0; }
  nav { display: flex; flex-direction: column; gap: 2px; }
  .gt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); font-weight: 650; padding: 16px 12px 6px; }
  .sep { height: 1px; background: var(--border); margin: 10px 8px; }
  .sidebar a { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 12px; color: var(--muted); font-weight: 560; transition: background 0.15s, color 0.15s; position: relative; }
  .collapsed .sidebar a { justify-content: center; padding: 10px; }
  .sidebar a:hover { color: var(--text); background: rgba(148, 163, 184, 0.06); }
  .sidebar a.active { color: var(--text); background: rgba(148, 163, 184, 0.09); }
  .sidebar a.active .ni { color: var(--c); }
  .sidebar a.active::before { content: ''; position: absolute; left: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--c); }
  .ni { display: grid; place-items: center; transition: color 0.15s; }
  .sync { margin-top: auto; padding: 14px 12px 0; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 8px; }

  .main-col { min-width: 0; }
  main { padding: 28px 32px 48px; max-width: 1400px; margin: 0 auto; }
  .boot { display: flex; flex-direction: column; gap: 16px; }
  .banner { margin: 16px 32px 0; padding: 10px 14px; border-radius: 12px; background: rgba(34, 211, 238, 0.08); border: 1px solid rgba(34, 211, 238, 0.25); color: var(--accent); font-size: 13px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .banner.err { background: rgba(248, 113, 113, 0.08); border-color: rgba(248, 113, 113, 0.3); color: var(--crit); }
  .pbar { flex: 1; min-width: 120px; height: 4px; background: rgba(34, 211, 238, 0.15); border-radius: 4px; overflow: hidden; }
  .pbar div { height: 100%; background: var(--accent); transition: width 0.4s; }

  .mobile-head, .bottom { display: none; }

  @media (max-width: 960px) {
    .shell, .shell.collapsed { grid-template-columns: minmax(0, 1fr); }
    .sidebar { display: none; }
    main { padding: 12px 14px calc(96px + var(--safe-bottom)); }
    .banner { margin: 10px 14px 0; }
    .mobile-head { display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 40; padding: calc(12px + var(--safe-top)) 16px 10px; background: rgba(11, 16, 32, 0.82); backdrop-filter: blur(14px); border-bottom: 1px solid var(--border); }
    .mh-title { display: flex; align-items: center; gap: 10px; }
    .mh-title h1 { font-size: 20px; }
    .bottom {
      display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; flex-direction: row; justify-content: space-around;
      padding: 6px 4px calc(6px + var(--safe-bottom)); background: rgba(14, 20, 40, 0.92); backdrop-filter: blur(16px); border-top: 1px solid var(--border);
    }
    .bottom a { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px; border-radius: 12px; color: var(--muted); font-size: 10.5px; font-weight: 600; flex: 1; transition: color 0.15s; }
    .bottom a.active { color: var(--accent); }
    .bottom a.active :global(svg) { filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.5)); }
  }
</style>
