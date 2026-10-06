<script>
  import { onMount } from 'svelte';
  import { get, post, del, url } from '../../lib/api.js';
  import { app, toast, loadMeta, href } from '../../lib/state.svelte.js';
  import { fmtDateTime, timeAgo, num, bytes } from '../../lib/format.js';
  import Card from '../../components/Card.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Icon from '../../components/Icon.svelte';

  let src = $state(null);
  onMount(async () => {
    src = await get('/sources');
  });
  const NAMES = { tasker: 'Health Connect über Tasker', 'hc-bridge': 'HC Bridge (eigene App)', 'ph-app': 'pH-App', unbekannt: 'Unbekannt' };
  const PKG = { 'nl.appyhapps.healthsync': 'Health Sync (Huawei-Band)', 'com.sec.android.app.shealth': 'Samsung Health', 'com.google.android.apps.fitness': 'Google Fit', android: 'Android (Handy)', 'com.huawei.health': 'Huawei Health', 'ph-app': 'pH-App', manuell: 'manuell', profil: 'Profil' };
  const TYPE = { hr: 'Puls', spo2: 'SpO₂', ph: 'pH', weight: 'Gewicht', steps: 'Schritte', distance: 'Distanz', active_kcal: 'Aktive kcal', total_kcal: 'Gesamt-kcal', floors: 'Stockwerke', hrv: 'HRV', resting_hr: 'Ruhepuls', bp: 'Blutdruck', temp: 'Temperatur', resp_rate: 'Atemfrequenz', hydration: 'Trinkmenge', body_fat: 'Körperfett', vo2max: 'VO₂max', height: 'Größe', glucose: 'Blutzucker' };
  const byPkg = $derived.by(() => {
    if (!src) return [];
    const m = new Map();
    for (const r of [...src.intervals, ...src.samples]) {
      const k = r.source || 'unbekannt';
      if (!m.has(k)) m.set(k, { pkg: k, types: [], last: 0 });
      const e = m.get(k);
      e.types.push(`${TYPE[r.type] || r.type} (${num(r.n)})`);
      e.last = Math.max(e.last, r.last || 0);
    }
    return [...m.values()].sort((a, b) => b.last - a.last);
  });

  let rebuildOpen = $state(false);
  let wipeOpen = $state(false);
  let wipeText = $state('');
  async function rebuild() {
    await post('/admin/rebuild');
    rebuildOpen = false;
    toast('Datenbank wird aus dem Archiv neu aufgebaut …');
    setTimeout(loadMeta, 1500);
  }
  async function wipe() {
    try {
      await del('/data', { confirm: wipeText });
      wipeOpen = false;
      wipeText = '';
      toast('Alle Messwerte gelöscht (Archiv bleibt erhalten)');
      loadMeta();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
</script>

<div class="stack">
  <div class="grid g2">
    <Card title="Eingänge" subtitle="Wann welcher Sender zuletzt Daten geliefert hat" icon="📥" accent="#22d3ee">
      <div class="list">
        {#each Object.entries(app.meta.lastBySource).sort((a, b) => b[1].last.localeCompare(a[1].last)) as [k, v]}
          <div class="row between li">
            <div><b>{NAMES[k] || k}</b><div class="tiny muted">{num(v.count)} Sendungen</div></div>
            <div class="right"><div>{timeAgo(Date.parse(v.last))}</div><div class="tiny muted">{fmtDateTime(Date.parse(v.last))}</div></div>
          </div>
        {/each}
      </div>
      <p class="tiny muted" style="margin-top:12px">Ingest-Endpunkt: <span class="mono">http://&lt;server&gt;:8321/ingest</span> (POST, JSON). Optionaler Header <span class="mono">X-Source</span> zur Kennzeichnung des Senders.</p>
    </Card>

    <Card title="HC Bridge – Android-App" subtitle="Liest Health Connect direkt aus und ersetzt Tasker (optional)" icon="📱" accent="#4ade80">
      {#if app.meta.apk}
        <p class="small">Version vom {fmtDateTime(app.meta.apk.mtime)} · {bytes(app.meta.apk.size)}</p>
        <a class="btn primary" style="margin-top:10px" href={url('/app/download')}><Icon name="download" size={16} /> APK herunterladen</a>
        <ol class="small muted steps">
          <li>APK auf dem Handy öffnen, Installation aus dieser Quelle erlauben.</li>
          <li>In der App Server-Adresse eintragen und Health-Connect-Berechtigungen erteilen.</li>
          <li>Einrichtungsassistent für die Samsung-Akkueinstellungen durchgehen.</li>
          <li>Ein paar Tage parallel zu Tasker laufen lassen, dann Tasker-Profil deaktivieren.</li>
        </ol>
      {:else}
        <p class="small muted">Die App wurde auf diesem Server noch nicht gebaut.</p>
      {/if}
    </Card>

    <Card title="pH-Wert – Android-App" subtitle="Manuelle Erfassung der Teststreifen-Werte mit eigenem Verlauf" icon="🧪" accent="#facc15">
      {#if app.meta.apkPh}
        <p class="small">Version vom {fmtDateTime(app.meta.apkPh.mtime)} · {bytes(app.meta.apkPh.size)}</p>
        <a class="btn primary" style="margin-top:10px" href={url('/app/ph/download')}><Icon name="download" size={16} /> APK herunterladen</a>
        <ol class="small muted steps">
          <li>APK auf dem Handy öffnen, Installation aus dieser Quelle erlauben.</li>
          <li>Im Setup (Zahnrad) Server-Adresse eintragen und „Verbindung testen“.</li>
          <li>Optional: Zielbereich übernehmen und bisherige Messungen vom Server importieren.</li>
          <li>Werte sendet die App als „pH-App“ – die bisherige pH-App kann danach weg.</li>
        </ol>
      {:else}
        <p class="small muted">Die App wurde auf diesem Server noch nicht gebaut (<span class="mono">android-ph/build.sh</span>).</p>
      {/if}
    </Card>
  </div>

  <Card title="Datenquellen in Health Connect" subtitle="Apps, deren Messwerte gespeichert sind" icon="🔗" accent="#a78bfa">
    {#snippet actions()}<a class="btn sm ghost" href={href('profil')}>Priorität einstellen</a>{/snippet}
    {#if !src}
      <p class="muted small">Lade …</p>
    {:else}
      <div class="list">
        {#each byPkg as p}
          <div class="row between li wrap">
            <div class="grow"><b>{PKG[p.pkg] || p.pkg}</b><div class="tiny muted">{p.types.join(' · ')}</div></div>
            <div class="small muted">{p.last ? timeAgo(p.last) : ''}</div>
          </div>
        {/each}
      </div>
    {/if}
    {#if app.meta.unknownTypes.length}
      <div class="unk">
        <b class="small">Noch nicht ausgewertete Typen</b>
        <div class="tiny muted">Werden gespeichert und automatisch nachverarbeitet, sobald es einen Parser gibt:</div>
        <div class="row wrap" style="margin-top:6px">{#each app.meta.unknownTypes as u}<span class="chip">{u.type} ({num(u.count)})</span>{/each}</div>
      </div>
    {/if}
  </Card>

  <Card title="Wartung" icon="🛠️" accent="#f87171">
    <div class="maint">
      <div>
        <b>Aus Rohdaten-Archiv neu aufbauen</b>
        <p class="small muted">Liest alle archivierten Sendungen erneut ein. Deine Korrekturen bleiben erhalten. Dauert einige Minuten.</p>
        <button class="btn" onclick={() => (rebuildOpen = true)}><Icon name="refresh" size={16} /> Neu aufbauen</button>
      </div>
      <div>
        <b>Alle Messwerte löschen</b>
        <p class="small muted">Löscht alle Messwerte und Korrekturen aus der Datenbank. Das Rohdaten-Archiv, Tagebuch und Profil bleiben erhalten – ein Neuaufbau ist jederzeit möglich.</p>
        <button class="btn danger" onclick={() => (wipeOpen = true)}><Icon name="trash" size={16} /> Alle löschen …</button>
      </div>
    </div>
  </Card>
</div>

<Sheet bind:open={rebuildOpen} title="Datenbank neu aufbauen?" width={440}>
  <p class="small">Alle Sendungen aus dem Archiv werden erneut verarbeitet. Korrekturen, Löschungen und nachgetragene Werte bleiben erhalten.</p>
  {#snippet footer()}<button class="btn" onclick={() => (rebuildOpen = false)}>Abbrechen</button><button class="btn primary" onclick={rebuild}>Neu aufbauen</button>{/snippet}
</Sheet>

<Sheet bind:open={wipeOpen} title="Alle Messwerte löschen?" width={440}>
  <div class="stack">
    <p class="small">Zum Bestätigen <b>LÖSCHEN</b> eingeben. Das Rohdaten-Archiv bleibt erhalten.</p>
    <input bind:value={wipeText} placeholder="LÖSCHEN" />
  </div>
  {#snippet footer()}<button class="btn" onclick={() => (wipeOpen = false)}>Abbrechen</button><button class="btn danger" disabled={wipeText !== 'LÖSCHEN'} onclick={wipe}>Endgültig löschen</button>{/snippet}
</Sheet>

<style>
  .list { display: flex; flex-direction: column; }
  .li { padding: 10px 0; border-bottom: 1px solid var(--border); }
  .li:last-child { border-bottom: none; }
  .right { text-align: right; font-size: 13px; }
  .steps { margin: 12px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
  .unk { margin-top: 14px; padding: 12px; border-radius: 12px; background: rgba(148, 163, 184, 0.05); }
  .maint { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .maint > div { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  @media (max-width: 720px) { .maint { grid-template-columns: 1fr; } }
</style>
