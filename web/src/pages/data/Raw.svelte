<script>
  import { onMount } from 'svelte';
  import { get, url } from '../../lib/api.js';
  import { fmtDateTime, bytes, num, monthName } from '../../lib/format.js';
  import Card from '../../components/Card.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Empty from '../../components/Empty.svelte';
  import Loading from '../../components/Loading.svelte';
  import Icon from '../../components/Icon.svelte';

  let months = $state([]);
  let month = $state(null);
  let q = $state('');
  let full = $state(false);
  let source = $state('');
  let page = $state(1);
  let res = $state(null);
  let loading = $state(false);
  let open = $state(false);
  let detail = $state(null);

  onMount(async () => {
    months = await get('/raw/months');
    month = months[0]?.month || null;
  });
  let timer;
  $effect(() => {
    if (!month) return;
    const params = { month, q, full: full ? 1 : '', source, page, size: 50 };
    clearTimeout(timer);
    timer = setTimeout(() => {
      loading = true;
      get('/raw', params).then((r) => {
        res = r;
        loading = false;
      });
    }, q ? 350 : 0);
  });
  async function show(it) {
    detail = null;
    open = true;
    detail = await get(`/raw/${month}/${it.id}`);
  }
  const mLabel = (m) => `${monthName(+m.slice(5) - 1)} ${m.slice(0, 4)}`;
  const SRC = { tasker: 'Health Connect (Tasker)', 'hc-bridge': 'HC Bridge', 'ph-app': 'pH-App' };
  const pages = $derived(res ? Math.max(1, Math.ceil(res.total / res.size)) : 1);
</script>

<div class="stack">
  <Card title="Rohdaten-Archiv" subtitle="Jede empfangene Sendung unverändert, monatlich komprimiert gespeichert">
    <div class="months">
      {#each months as m}
        <button class="mcard" class:active={m.month === month} onclick={() => { month = m.month; page = 1; }}>
          <b>{mLabel(m.month)}</b>
          <span class="tiny muted">{num(m.count)} Sendungen · {bytes(m.size)}{m.bytes ? ` (entpackt ${bytes(m.bytes)})` : ''}</span>
        </button>
      {/each}
    </div>
  </Card>

  {#if month}
    <Card title={mLabel(month)}>
      {#snippet actions()}<a class="btn sm" href={url(`/raw/${month}/download`)}><Icon name="download" size={15} /> Monat herunterladen (.jsonl.gz)</a>{/snippet}
      <div class="toolbar">
        <input type="search" placeholder="Suchen (Typ, ID, Quelle …)" bind:value={q} oninput={() => (page = 1)} class="grow" />
        <select bind:value={source} onchange={() => (page = 1)}>
          <option value="">alle Quellen</option>
          <option value="tasker">Tasker</option>
          <option value="hc-bridge">HC Bridge</option>
          <option value="ph-app">pH-App</option>
        </select>
        <label class="row small muted"><input type="checkbox" bind:checked={full} /> auch im Inhalt suchen (langsam)</label>
      </div>
      {#if loading && !res}
        <Loading rows={8} />
      {:else if !res?.items.length}
        <Empty icon="📦" title="Keine Sendungen" />
      {:else}
        <div class="table-wrap">
          <table class="list">
            <thead><tr><th>#</th><th>Empfangen</th><th>Quelle</th><th>Inhalt</th><th>Größe</th><th></th></tr></thead>
            <tbody>
              {#each res.items as it}
                <tr>
                  <td class="num muted small">{it.seq}</td>
                  <td class="num small">{fmtDateTime(Date.parse(it.receivedAt))}</td>
                  <td class="small">{SRC[it.source] || it.source}</td>
                  <td class="small">{it.summary}</td>
                  <td class="num small muted">{bytes(it.bytes)}</td>
                  <td><button class="btn sm ghost" onclick={() => show(it)}>Ansehen</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="pager">
          <button class="btn sm" disabled={page <= 1} onclick={() => page--}>‹ Neuer</button>
          <span class="muted small">Seite {page} von {pages} · {num(res.total)} Sendungen</span>
          <button class="btn sm" disabled={page >= pages} onclick={() => page++}>Älter ›</button>
        </div>
      {/if}
    </Card>
  {/if}
</div>

<Sheet bind:open title="Sendung" width={820}>
  {#if !detail}
    <Loading rows={10} />
  {:else}
    <div class="small muted" style="margin-bottom:8px">{detail.entry.id} · {fmtDateTime(Date.parse(detail.entry.receivedAt))} · {detail.entry.summary}</div>
    <pre class="json mono">{JSON.stringify(detail.record.payload, null, 2).slice(0, 400000)}</pre>
  {/if}
</Sheet>

<style>
  .months { display: flex; gap: 8px; flex-wrap: wrap; }
  .mcard { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border); background: rgba(148, 163, 184, 0.04); cursor: pointer; text-align: left; }
  .mcard.active { border-color: var(--accent); background: rgba(34, 211, 238, 0.07); }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px; flex-wrap: wrap; }
  .json { background: #070b17; border: 1px solid var(--border); border-radius: 12px; padding: 14px; font-size: 12px; max-height: 60vh; overflow: auto; white-space: pre; color: #a5f3fc; }
</style>
