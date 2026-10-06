<script>
  import { download } from '../../lib/api.js';
  import { app } from '../../lib/state.svelte.js';
  import { today, addDays } from '../../lib/format.js';
  import Card from '../../components/Card.svelte';
  import Icon from '../../components/Icon.svelte';

  let from = $state(addDays(today(), -29));
  let to = $state(today());
  let pFrom = $state(addDays(today(), -29));
  let pTo = $state(today());
  function preset(n, which) {
    if (which === 'csv') { from = addDays(today(), -(n - 1)); to = today(); }
    else { pFrom = addDays(today(), -(n - 1)); pTo = today(); }
  }
</script>

<div class="grid g2">
  <Card title="CSV-Export (Tageswerte)" icon="📊" accent="#22d3ee">
    <p class="muted small">Ein Wert pro Tag: Puls Ø/min/max, Schritte, Schlafdauer, SpO₂, pH (Ø und alle Messungen mit Eingangszeit), Gewicht/BMI, Notizen, Tags und – falls vorhanden – weitere Messarten. Korrigierte Werte werden verwendet. Format für Excel (Semikolon, Dezimalkomma).</p>
    <div class="presets">
      {#each [[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [365, '1 Jahr']] as [n, l]}<button class="chip click" onclick={() => preset(n, 'csv')}>{l}</button>{/each}
    </div>
    <div class="row wrap">
      <label class="field grow">Von<input type="date" bind:value={from} max={to} /></label>
      <label class="field grow">Bis<input type="date" bind:value={to} min={from} max={today()} /></label>
    </div>
    <div class="row wrap" style="margin-top:14px">
      <button class="btn primary grow" onclick={() => download('/export.csv', { from, to })}><Icon name="download" size={16} /> Zeitraum exportieren</button>
      <button class="btn grow" onclick={() => download('/export.csv')}><Icon name="download" size={16} /> Alle Daten</button>
    </div>
  </Card>

  <Card title="PDF-Bericht" icon="📄" accent="#818cf8">
    <p class="muted small">Übersicht mit Bewertungen, Verlaufskurven, allen pH-Messungen, Tagebuch und Auffälligkeiten – zum Ausdrucken oder für den Arzttermin.</p>
    <div class="presets">
      {#each [[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [365, '1 Jahr']] as [n, l]}<button class="chip click" onclick={() => preset(n, 'pdf')}>{l}</button>{/each}
    </div>
    <div class="row wrap">
      <label class="field grow">Von<input type="date" bind:value={pFrom} max={pTo} /></label>
      <label class="field grow">Bis<input type="date" bind:value={pTo} min={pFrom} max={today()} /></label>
    </div>
    <button class="btn primary" style="margin-top:14px;width:100%" onclick={() => download('/report.pdf', { from: pFrom, to: pTo })}><Icon name="file" size={16} /> PDF erstellen</button>
  </Card>
</div>

<style>
  .presets { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
</style>
