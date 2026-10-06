<script>
  import { get } from '../../lib/api.js';
  import { fmtDateTime, num } from '../../lib/format.js';
  import Card from '../../components/Card.svelte';
  import Empty from '../../components/Empty.svelte';
  import Loading from '../../components/Loading.svelte';

  let page = $state(1);
  let res = $state(null);
  $effect(() => {
    get('/edit/log', { page, size: 50 }).then((r) => (res = r));
  });
  const KIND = { ph: 'pH-Wert', hr: 'Herzfrequenz', spo2: 'SpO₂', weight: 'Gewicht', steps: 'Schritte', sleep: 'Schlaf', bp: 'Blutdruck', resting_hr: 'Ruhepuls', hrv: 'HRV', temp: 'Temperatur', resp_rate: 'Atemfrequenz', body_fat: 'Körperfett', vo2max: 'VO₂max', glucose: 'Blutzucker', alle: 'Alle Daten' };
  const ACT = { 'geändert': 'info', 'gelöscht': 'crit', 'nachgetragen': 'ok', 'zurückgesetzt': 'neutral', 'wiederhergestellt': 'ok' };
  const fmtV = (v) => (v == null ? '–' : /^-?\d+(\.\d+)?$/.test(v) ? num(+v, v.includes('.') ? Math.min(2, v.split('.')[1].length) : 0) : v.replace(/T(\d\d:\d\d)/g, ' $1'));
  const pages = $derived(res ? Math.max(1, Math.ceil(res.total / res.size)) : 1);
</script>

<Card title="Änderungsprotokoll" subtitle="Jede manuelle Änderung mit Zeitpunkt und Gerät">
  {#if !res}
    <Loading rows={8} />
  {:else if !res.items.length}
    <Empty icon="📝" title="Noch keine Änderungen" text="Hier erscheint jede Korrektur, Löschung und jeder nachgetragene Wert." />
  {:else}
    <div class="table-wrap">
      <table class="list">
        <thead><tr><th>Zeitpunkt</th><th>Messart</th><th>Aktion</th><th>Feld</th><th>Vorher</th><th>Nachher</th><th>Gerät</th></tr></thead>
        <tbody>
          {#each res.items as r}
            <tr>
              <td class="num small">{fmtDateTime(r.at)}</td>
              <td>{KIND[r.kind] || r.kind}</td>
              <td><span class="badge {ACT[r.action] || 'neutral'}">{r.action}</span></td>
              <td class="small muted">{r.field || ''}</td>
              <td class="num small">{fmtV(r.old_value)}</td>
              <td class="num small"><b>{fmtV(r.new_value)}</b></td>
              <td class="tiny muted">{r.device}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if pages > 1}
      <div class="pager">
        <button class="btn sm" disabled={page <= 1} onclick={() => page--}>‹ Neuer</button>
        <span class="muted small">Seite {page} von {pages}</span>
        <button class="btn sm" disabled={page >= pages} onclick={() => page++}>Älter ›</button>
      </div>
    {/if}
  {/if}
</Card>

<style>
  .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px; }
</style>
