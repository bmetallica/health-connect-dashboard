<script>
  import { onMount } from 'svelte';
  import { get, put, post, patch, del } from '../lib/api.js';
  import { toast } from '../lib/state.svelte.js';
  import { COLORS } from '../lib/theme.js';
  import { today, addDays, weekday, monthName, fmtDayLong, num, dur } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Card from '../components/Card.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Icon from '../components/Icon.svelte';

  let month = $state(today().slice(0, 7));
  let entries = $state({});
  let daily = $state({});
  let tags = $state([]);
  let open = $state(false);
  let cur = $state(null);
  let note = $state('');
  let tagIds = $state([]);
  let newTag = $state('');
  let newColor = $state('#38bdf8');
  let manage = $state(false);

  const first = $derived(month + '-01');
  const last = $derived(addDays(addDays(first, 32).slice(0, 7) + '-01', -1));

  async function load() {
    const [j, d, t] = await Promise.all([get('/journal', { from: first, to: last }), get('/daily', { from: first, to: last }), get('/tags')]);
    entries = Object.fromEntries(j.entries.map((e) => [e.day, e]));
    daily = Object.fromEntries(d.days.map((x) => [x.day, x]));
    tags = t;
  }
  $effect(() => {
    first;
    load();
  });

  const cells = $derived.by(() => {
    const out = [];
    const pad = (weekday(first) + 6) % 7; // Monday first
    for (let i = 0; i < pad; i++) out.push(null);
    for (let k = first; k <= last; k = addDays(k, 1)) out.push(k);
    return out;
  });
  const tagById = $derived(Object.fromEntries(tags.map((t) => [t.id, t])));

  function shift(n) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    month = d.toISOString().slice(0, 7);
  }
  function openDay(k) {
    if (k > today()) return;
    cur = k;
    note = entries[k]?.note || '';
    tagIds = [...(entries[k]?.tagIds || [])];
    open = true;
  }
  async function save() {
    try {
      await put('/journal/' + cur, { note, tagIds });
      toast('Gespeichert');
      open = false;
      load();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  async function addTag() {
    if (!newTag.trim()) return;
    try {
      await post('/tags', { name: newTag.trim(), color: newColor });
      newTag = '';
      load();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  async function updTag(t, field, value) {
    await patch('/tags/' + t.id, { [field]: value });
    load();
  }
  let delTag = $state(null);
  async function removeTag() {
    await del('/tags/' + delTag.id);
    delTag = null;
    load();
  }
  const d = $derived(cur ? daily[cur] : null);
</script>

<PageHead title="Tagebuch" subtitle="Notizen und Tags pro Tag – Grundlage für die Zusammenhänge in der Analyse">
  {#snippet actions()}<button class="btn" onclick={() => (manage = true)}><Icon name="tag" size={16} /> Tags verwalten</button>{/snippet}
</PageHead>

<Card accent={COLORS.journal}>
  <div class="mhead">
    <button class="btn icon ghost" onclick={() => shift(-1)} aria-label="Vorheriger Monat">‹</button>
    <h2>{monthName(+month.slice(5) - 1)} {month.slice(0, 4)}</h2>
    <button class="btn icon ghost" onclick={() => shift(1)} disabled={month >= today().slice(0, 7)} aria-label="Nächster Monat">›</button>
  </div>
  <div class="cal">
    {#each ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as w}<div class="wd">{w}</div>{/each}
    {#each cells as k}
      {#if !k}
        <div></div>
      {:else}
        {@const e = entries[k]}
        {@const x = daily[k]}
        <button class="cell" class:today={k === today()} class:future={k > today()} class:has={e} onclick={() => openDay(k)}>
          <span class="dn">{+k.slice(8)}</span>
          {#if e?.note}<span class="ni" title="Notiz"><Icon name="book" size={12} /></span>{/if}
          <span class="dots">{#each e?.tagIds || [] as id}{#if tagById[id]}<span class="dot" style="background:{tagById[id].color}" title={tagById[id].name}></span>{/if}{/each}</span>
          {#if x}
            <span class="mini">
              {#if x.sleep}<span style="color:{COLORS.sleep}">☾ {num(x.sleep.totalMs / 3600000, 1)}</span>{/if}
              {#if x.phAvg != null}<span style="color:{COLORS.ph}">pH {num(x.phAvg, 1)}</span>{/if}
            </span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
  <div class="legend">
    {#each tags as t}<span class="chip"><span class="dot" style="background:{t.color}"></span>{t.name}</span>{/each}
  </div>
</Card>

<Sheet bind:open title={cur ? fmtDayLong(cur) : ''}>
  {#if cur}
    <div class="stack">
      {#if d}
        <div class="facts">
          {#if d.steps != null}<span><b>{num(d.steps)}</b> Schritte</span>{/if}
          {#if d.sleep}<span><b>{dur(d.sleep.totalMs)}</b> Schlaf</span>{/if}
          {#if d.hr}<span>Ø <b>{num(d.hr.avg)}</b> bpm</span>{/if}
          {#if d.phAvg != null}<span>pH <b>{d.ph.map((p) => num(p.value, 1)).join(' / ')}</b></span>{/if}
          {#if d.weight}<span><b>{num(d.weight, 1)}</b> kg</span>{/if}
        </div>
      {/if}
      <div>
        <div class="field" style="margin-bottom:8px">Tags</div>
        <div class="tags">
          {#each tags as t}
            <button class="chip click" class:on={tagIds.includes(t.id)} style="--tc:{t.color}" onclick={() => (tagIds = tagIds.includes(t.id) ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}>
              <span class="dot" style="background:{t.color}"></span>{t.name}
            </button>
          {/each}
        </div>
      </div>
      <label class="field">Notiz<textarea bind:value={note} rows="5" placeholder="Was war heute besonders?"></textarea></label>
      <button class="btn primary" onclick={save}>Speichern</button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={manage} title="Tags verwalten" width={480}>
  <div class="stack">
    {#each tags as t (t.id)}
      <div class="row">
        <input type="color" value={t.color} onchange={(e) => updTag(t, 'color', e.target.value)} class="color" />
        <input class="grow" value={t.name} onchange={(e) => updTag(t, 'name', e.target.value)} />
        <span class="tiny muted" style="width:54px;text-align:right">{t.uses}×</span>
        <button class="btn icon ghost" onclick={() => (delTag = t)} title="Löschen"><Icon name="trash" size={16} /></button>
      </div>
    {/each}
    {#if delTag}
      <div class="warnbox">„{delTag.name}“ löschen? Der Tag wird auch von {delTag.uses} Tagen entfernt.
        <div class="row" style="margin-top:8px"><button class="btn sm danger" onclick={removeTag}>Löschen</button><button class="btn sm" onclick={() => (delTag = null)}>Abbrechen</button></div>
      </div>
    {/if}
    <form class="row" onsubmit={(e) => { e.preventDefault(); addTag(); }}>
      <input type="color" bind:value={newColor} class="color" />
      <input class="grow" bind:value={newTag} placeholder="Neuer Tag, z. B. Fasten" />
      <button class="btn" type="submit"><Icon name="plus" size={16} /></button>
    </form>
  </div>
</Sheet>

<style>
  .mhead { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px; }
  .mhead h2 { min-width: 180px; text-align: center; }
  .cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .wd { text-align: center; font-size: 11px; color: var(--muted); font-weight: 650; text-transform: uppercase; padding-bottom: 4px; }
  .cell { position: relative; min-height: 86px; border-radius: 12px; border: 1px solid var(--border); background: rgba(148, 163, 184, 0.03); padding: 8px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: background 0.15s, border-color 0.15s; }
  .cell:hover { background: rgba(148, 163, 184, 0.07); border-color: var(--border-strong); }
  .cell.has { background: rgba(148, 163, 184, 0.06); }
  .cell.today { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .cell.future { opacity: 0.3; cursor: default; }
  .dn { font-weight: 650; font-size: 13px; }
  .ni { position: absolute; top: 8px; right: 8px; color: var(--muted); }
  .dots { display: flex; gap: 3px; flex-wrap: wrap; }
  .mini { margin-top: auto; display: flex; flex-direction: column; font-size: 10.5px; font-weight: 600; line-height: 1.3; }
  .legend { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip.on { background: color-mix(in srgb, var(--tc) 22%, transparent); border-color: var(--tc); color: var(--text); }
  .facts { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--muted); padding: 10px 12px; background: rgba(148, 163, 184, 0.05); border-radius: 12px; }
  .facts b { color: var(--text); }
  .color { width: 40px; height: 36px; padding: 2px; flex: none; }
  .warnbox { padding: 10px 12px; border-radius: 10px; background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.3); font-size: 13px; }
  @media (max-width: 720px) { .cell { min-height: 58px; padding: 5px; } .mini { display: none; } .cal { gap: 4px; } }
</style>
