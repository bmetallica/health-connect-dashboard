<script>
  // edit / add / delete / reset measurements per type, for any period
  import { get, post, patch, put, del } from '../../lib/api.js';
  import { app, toast, navigate } from '../../lib/state.svelte.js';
  import { COLORS } from '../../lib/theme.js';
  import { num, fmtDay, fmtTime, fmtDateTime, toLocalInput, nowLocalInput, today, addDays, parseNumber, dur, timeAgo } from '../../lib/format.js';
  import Card from '../../components/Card.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Empty from '../../components/Empty.svelte';
  import Loading from '../../components/Loading.svelte';
  import Icon from '../../components/Icon.svelte';

  const q = app.route.query;
  const KCOL = { ph: COLORS.ph, hr: COLORS.hr, spo2: COLORS.spo2, weight: COLORS.weight, steps: COLORS.steps, sleep: COLORS.sleep, resting_hr: COLORS.resting, hrv: COLORS.hrv, bp: COLORS.bp, temp: COLORS.temp, resp_rate: COLORS.resp, body_fat: '#f472b6', vo2max: '#a3e635', glucose: '#c084fc' };
  const ALWAYS = ['ph', 'hr', 'spo2', 'weight'];
  const kinds = $derived.by(() => {
    const m = app.meta;
    const list = [];
    for (const [k, v] of Object.entries(m.kinds)) {
      if (ALWAYS.includes(k) || m.types[k]) list.push({ value: k, label: v.label, color: KCOL[k], cfg: v, mode: 'sample' });
    }
    list.splice(3, 0, { value: 'steps', label: 'Schritte', color: KCOL.steps, cfg: m.dayKinds.steps, mode: 'day' });
    list.splice(4, 0, { value: 'sleep', label: 'Schlaf', color: KCOL.sleep, cfg: { label: 'Schlaf' }, mode: 'sleep' });
    return list;
  });

  let kind = $state(q.kind || 'ph');
  let from = $state(q.from || addDays(today(), -29));
  let to = $state(q.to || today());
  let filter = $state('all');
  let page = $state(1);
  let res = $state(null);
  let loading = $state(false);
  let reload = $state(0);
  const k = $derived(kinds.find((x) => x.value === kind) || kinds[0]);
  const size = 50;

  $effect(() => {
    // reset paging when the selection changes
    kind; from; to; filter;
    page = 1;
  });
  $effect(() => {
    if (!k) return;
    reload;
    const params = { from, to, filter, page, size };
    const path = k.mode === 'sample' ? '/edit/samples/' + k.value : k.mode === 'day' ? '/edit/days/' + k.value : '/edit/sleep';
    loading = true;
    get(path, params).then((r) => {
      res = r;
      loading = false;
    }).catch((e) => {
      toast(e.message, 'err');
      loading = false;
    });
  });

  const items = $derived(res?.items || []);
  const pages = $derived(res ? Math.max(1, Math.ceil(res.total / (k.mode === 'sample' ? size : res.total || 1))) : 1);

  // ---------- edit sheet ----------
  let open = $state(false);
  let item = $state(null); // null = new entry
  let f = $state({});
  let warn = $state('');
  let confirmDel = $state(false);
  let busy = $state(false);

  function fmtVal(it) {
    if (k.mode === 'sleep') return dur(it.durationMs);
    if (it.value == null) return '–';
    if (k.cfg.two) return `${num(it.value)} / ${num(it.value2)}`;
    return num(it.value, k.cfg.digits ?? 1);
  }
  function startEdit(it) {
    item = it;
    warn = '';
    confirmDel = false;
    if (k.mode === 'sample') f = { value: it ? String(it.value).replace('.', ',') : '', value2: it?.value2 != null ? String(it.value2).replace('.', ',') : '', time: it ? toLocalInput(it.time) : nowLocalInput() };
    else if (k.mode === 'day') f = { day: it ? it.day : today(), value: it?.value != null ? String(Math.round(it.value)) : '' };
    else f = { start: it ? toLocalInput(it.start) : addDays(today(), -1) + 'T23:00', end: it ? toLocalInput(it.end) : today() + 'T07:00' };
    open = true;
  }
  function plausible() {
    if (k.mode === 'sleep') {
      const h = (Date.parse(f.end) - Date.parse(f.start)) / 3600000;
      if (!(h > 0)) return 'Ende muss nach dem Beginn liegen.';
      return h > 16 ? `${num(h, 1)} h Schlaf ist ungewöhnlich lang.` : '';
    }
    const v = parseNumber(f.value);
    if (!Number.isFinite(v)) return null;
    const [lo, hi] = k.cfg.warn || [-Infinity, Infinity];
    if (v < lo || v > hi) return `${k.cfg.label} ${f.value}${k.cfg.unit ? ' ' + k.cfg.unit : ''} liegt außerhalb des üblichen Bereichs (${lo}–${hi}). Vielleicht ein Komma vergessen?`;
    if (k.cfg.two) {
      const v2 = parseNumber(f.value2);
      const [l2, h2] = k.cfg.warn2;
      if (Number.isFinite(v2) && (v2 < l2 || v2 > h2)) return `Diastolischer Wert ${f.value2} ist ungewöhnlich.`;
    }
    return '';
  }
  async function save() {
    if (k.mode !== 'sleep' && !Number.isFinite(parseNumber(f.value))) return toast('Bitte eine Zahl eingeben', 'err');
    const w = plausible();
    if (w === 'Ende muss nach dem Beginn liegen.') return toast(w, 'err');
    if (w && warn !== w) {
      warn = w; // first click shows the warning, second click saves anyway
      return;
    }
    busy = true;
    try {
      if (k.mode === 'sample') {
        const body = { value: f.value, time: f.time };
        if (k.cfg.two) body.value2 = f.value2;
        if (item) await patch('/edit/samples/' + item.id, body);
        else await post('/edit/samples', { ...body, type: k.value });
      } else if (k.mode === 'day') {
        await put(`/edit/days/${k.value}/${f.day}`, { value: f.value });
      } else {
        if (item) await patch('/edit/sleep/' + item.id, { start: f.start, end: f.end });
        else await post('/edit/sleep', { start: f.start, end: f.end });
      }
      toast(item ? 'Änderung gespeichert' : 'Eintrag nachgetragen');
      open = false;
      reload++;
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      busy = false;
    }
  }
  async function remove() {
    busy = true;
    try {
      if (k.mode === 'sample') await del('/edit/samples/' + item.id);
      else if (k.mode === 'sleep') await del('/edit/sleep/' + item.id);
      toast('Gelöscht – lässt sich mit „Wiederherstellen“ rückgängig machen');
      open = false;
      reload++;
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      busy = false;
    }
  }
  async function reset(it) {
    try {
      if (k.mode === 'sample') await post(`/edit/samples/${it.id}/reset`);
      else if (k.mode === 'day') await del(`/edit/days/${k.value}/${it.day}`);
      else await post(`/edit/sleep/${it.id}/reset`);
      toast(it.deleted ? 'Wiederhergestellt' : 'Auf Originalwert zurückgesetzt');
      open = false;
      reload++;
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  const canReset = (it) => it.edited || it.deleted;
  const original = (it) => {
    if (k.mode === 'sample') {
      const parts = [];
      if (it.edited && it.rawValue !== it.value) parts.push(k.cfg.two ? `${num(it.rawValue)} / ${num(it.rawValue2)}` : num(it.rawValue, k.cfg.digits ?? 1));
      if (it.edited && it.rawTime !== it.time) parts.push(fmtDateTime(it.rawTime));
      return parts.join(' · ');
    }
    if (k.mode === 'day') return it.edited && it.original != null ? num(it.original) : '';
    return it.edited ? `${fmtTime(it.rawStart)} – ${fmtTime(it.rawEnd)}` : '';
  };
  const SRC = { 'nl.appyhapps.healthsync': 'Band', 'com.sec.android.app.shealth': 'Samsung Health', 'com.google.android.apps.fitness': 'Google Fit', android: 'Handy', 'ph-app': 'pH-App', manuell: 'manuell', profil: 'Profil' };
  const srcName = (s) => SRC[s] || s || '–';
</script>

<div class="stack">
  <Segmented bind:value={kind} options={kinds} />

  <Card accent={k?.color}>
    <div class="toolbar">
      <label class="field">Von<input type="date" bind:value={from} max={to} /></label>
      <label class="field">Bis<input type="date" bind:value={to} min={from} max={today()} /></label>
      <label class="field">Anzeigen
        <select bind:value={filter}>
          <option value="all">alle</option>
          <option value="changed">nur geänderte</option>
          <option value="manual">nur nachgetragene</option>
          {#if k.mode !== 'day'}<option value="deleted">nur gelöschte</option>{/if}
        </select>
      </label>
      <div class="grow"></div>
      <button class="btn primary" onclick={() => startEdit(null)}><Icon name="plus" size={16} /> {k.mode === 'day' ? 'Tageswert setzen' : 'Nachtragen'}</button>
    </div>
  </Card>

  <Card title={`${k.label}${res ? ` · ${num(res.total)} Einträge` : ''}`} subtitle={k.mode === 'day' ? 'Tagessumme pro Tag – Korrektur ersetzt den berechneten Wert' : k.mode === 'sleep' ? 'Nächte (zusammengeführt aus allen Teil-Sendungen)' : 'Einzelmessungen, neueste zuerst'} accent={k?.color}>
    {#if loading && !res}
      <Loading rows={8} />
    {:else if !items.length}
      <Empty icon="🔍" title="Keine Einträge" text="Im gewählten Zeitraum und Filter gibt es keine Einträge." />
    {:else}
      <div class="table-wrap desktop">
        <table class="list">
          <thead><tr><th>{k.mode === 'day' ? 'Tag' : k.mode === 'sleep' ? 'Nacht zum' : 'Zeitpunkt'}</th>{#if k.mode === 'sleep'}<th>Zeitraum</th>{/if}<th>{k.mode === 'sleep' ? 'Dauer' : 'Wert'}</th><th>Original</th><th>Quelle</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {#each items as it}
              <tr class:deleted={it.deleted}>
                <td class="num">{k.mode === 'day' ? fmtDay(it.day) : k.mode === 'sleep' ? fmtDay(it.day) : fmtDateTime(it.time)}</td>
                {#if k.mode === 'sleep'}<td class="num">{fmtTime(it.start)} – {fmtTime(it.end)}</td>{/if}
                <td class="num"><b>{k.mode === 'day' ? (it.value == null ? '–' : num(it.value)) : fmtVal(it)}</b> <span class="muted tiny">{k.cfg.unit || ''}</span></td>
                <td class="num muted">{original(it)}</td>
                <td class="small muted">{k.mode === 'day' ? srcName(it.source) : srcName(it.source)}</td>
                <td>
                  {#if it.deleted}<span class="badge crit">gelöscht</span>{/if}
                  {#if it.edited && !it.deleted}<span class="badge info">geändert</span>{/if}
                  {#if it.manual}<span class="badge neutral">manuell</span>{/if}
                </td>
                <td class="acts">
                  {#if !it.deleted}<button class="btn icon ghost" title="Bearbeiten" onclick={() => startEdit(it)}><Icon name="edit" size={16} /></button>{/if}
                  {#if canReset(it)}<button class="btn icon ghost" title={it.deleted ? 'Wiederherstellen' : 'Zurücksetzen'} onclick={() => reset(it)}><Icon name="undo" size={16} /></button>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="mobile">
        {#each items as it}
          <button class="mi" class:deleted={it.deleted} onclick={() => (it.deleted ? reset(it) : startEdit(it))}>
            <div class="grow">
              <div class="mv"><b class="num">{k.mode === 'day' ? (it.value == null ? '–' : num(it.value)) : fmtVal(it)}</b> <span class="muted tiny">{k.cfg.unit || ''}</span>
                {#if original(it)}<span class="faint tiny"> statt {original(it)}</span>{/if}</div>
              <div class="muted tiny">{k.mode === 'day' ? fmtDay(it.day) : k.mode === 'sleep' ? `${fmtDay(it.day)} · ${fmtTime(it.start)} – ${fmtTime(it.end)}` : fmtDateTime(it.time)} · {srcName(it.source)}</div>
            </div>
            {#if it.deleted}<span class="badge crit">gelöscht · antippen = wiederherstellen</span>{:else if it.edited}<span class="badge info">geändert</span>{/if}
            {#if it.manual}<span class="badge neutral">manuell</span>{/if}
          </button>
        {/each}
      </div>

      {#if k.mode === 'sample' && pages > 1}
        <div class="pager">
          <button class="btn sm" disabled={page <= 1} onclick={() => page--}>‹ Zurück</button>
          <span class="muted small">Seite {page} von {pages}</span>
          <button class="btn sm" disabled={page >= pages} onclick={() => page++}>Weiter ›</button>
        </div>
      {/if}
    {/if}
  </Card>
</div>

<Sheet bind:open title={item ? `${k.label} bearbeiten` : k.mode === 'day' ? 'Tageswert setzen' : `${k.label} nachtragen`} width={460}>
  <form class="stack" onsubmit={(e) => { e.preventDefault(); save(); }}>
    {#if item && (k.mode !== 'day' ? original(item) : item.edited)}
      <div class="orig small">Originalwert: <b>{original(item) || '–'}</b></div>
    {/if}
    {#if k.mode === 'sample'}
      <div class="row">
        <label class="field grow">{k.cfg.two ? 'Systolisch' : 'Wert'}{k.cfg.unit ? ` (${k.cfg.unit})` : ''}<input inputmode="decimal" bind:value={f.value} oninput={() => (warn = '')} /></label>
        {#if k.cfg.two}<label class="field grow">Diastolisch<input inputmode="decimal" bind:value={f.value2} oninput={() => (warn = '')} /></label>{/if}
      </div>
      <label class="field">Zeitpunkt<input type="datetime-local" bind:value={f.time} /></label>
      <p class="tiny muted">Komma oder Punkt als Dezimalzeichen.</p>
    {:else if k.mode === 'day'}
      <label class="field">Tag<input type="date" bind:value={f.day} max={today()} disabled={!!item} /></label>
      <label class="field">Schritte (Tagessumme)<input inputmode="numeric" bind:value={f.value} oninput={() => (warn = '')} /></label>
    {:else}
      <label class="field">Eingeschlafen<input type="datetime-local" bind:value={f.start} oninput={() => (warn = '')} /></label>
      <label class="field">Aufgewacht<input type="datetime-local" bind:value={f.end} oninput={() => (warn = '')} /></label>
      {#if item && item.stages?.length}<p class="tiny muted">Die Schlafphasen werden auf den neuen Zeitraum zugeschnitten.</p>{/if}
    {/if}

    {#if warn}<div class="warnbox"><Icon name="info" size={16} /> {warn}</div>{/if}

    <button class="btn primary" type="submit" disabled={busy}>{warn ? 'Trotzdem speichern' : 'Speichern'}</button>

    {#if item}
      <div class="row wrap">
        {#if canReset(item)}<button type="button" class="btn grow" onclick={() => reset(item)}><Icon name="undo" size={16} /> Auf Original zurücksetzen</button>{/if}
        {#if k.mode !== 'day'}
          {#if !confirmDel}
            <button type="button" class="btn danger grow" onclick={() => (confirmDel = true)}><Icon name="trash" size={16} /> Löschen</button>
          {:else}
            <button type="button" class="btn danger grow" onclick={remove} disabled={busy}>Wirklich löschen</button>
          {/if}
        {/if}
      </div>
      {#if confirmDel}<p class="tiny muted">Gelöschte Einträge bleiben gespeichert und lassen sich über den Filter „nur gelöschte“ wiederherstellen.</p>{/if}
    {/if}
  </form>
</Sheet>

<style>
  .toolbar { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .toolbar .field { min-width: 140px; }
  tr.deleted td { opacity: 0.5; }
  tr.deleted td:last-child, tr.deleted td:nth-last-child(2) { opacity: 1; }
  .acts { white-space: nowrap; text-align: right; }
  .acts .btn { display: inline-flex; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px; }
  .orig { padding: 8px 12px; border-radius: 10px; background: rgba(34, 211, 238, 0.07); color: var(--text-2); }
  .warnbox { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: var(--warn); font-size: 13px; }
  .mobile { display: none; }
  .mi { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 12px 4px; border: 0; border-bottom: 1px solid var(--border); background: none; cursor: pointer; flex-wrap: wrap; }
  .mi.deleted { opacity: 0.6; }
  .mv { font-size: 16px; }
  @media (max-width: 720px) {
    .desktop { display: none; }
    .mobile { display: block; }
    .toolbar .field { min-width: 0; flex: 1 1 40%; }
    .toolbar .btn { width: 100%; }
  }
</style>
