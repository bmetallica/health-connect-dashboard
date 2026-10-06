<script>
  import { onMount } from 'svelte';
  import { get, put } from '../lib/api.js';
  import { toast, loadMeta } from '../lib/state.svelte.js';
  import { num, fmtDateTime, today } from '../lib/format.js';
  import PageHead from '../components/PageHead.svelte';
  import Card from '../components/Card.svelte';
  import Stat from '../components/Stat.svelte';
  import Loading from '../components/Loading.svelte';
  import Icon from '../components/Icon.svelte';

  let data = $state(null);
  let f = $state({});
  let prio = $state([]);
  let mode = $state('priority');
  let busy = $state(false);

  const PKG = { 'nl.appyhapps.healthsync': 'Huawei-Band (Health Sync)', 'com.huawei.health': 'Huawei Health', 'com.sec.android.app.shealth': 'Samsung Health', 'com.google.android.apps.fitness': 'Google Fit', android: 'Android (Handy-Schrittzähler)' };

  function fill(d) {
    data = d;
    const p = d.profile || {};
    f = {
      name: p.name || '', birthDate: p.birthDate || '', sex: p.sex || '', heightCm: p.heightCm ?? '', weightKg: p.weightKg != null ? String(p.weightKg).replace('.', ',') : '',
      trainingGoal: p.trainingGoal || 'aus', stepGoal: p.stepGoal ?? 10000,
      phTargetMin: p.phTargetMin != null ? String(p.phTargetMin).replace('.', ',') : '', phTargetMax: p.phTargetMax != null ? String(p.phTargetMax).replace('.', ',') : '',
    };
    prio = [...d.sources.priority];
    mode = d.sources.mode;
  }
  onMount(async () => fill(await get('/profile')));

  async function save(e) {
    e?.preventDefault();
    busy = true;
    try {
      fill(await put('/profile', { ...f, weightKg: f.weightKg ? String(f.weightKg).replace(',', '.') : '', phTargetMin: String(f.phTargetMin).replace(',', '.'), phTargetMax: String(f.phTargetMax).replace(',', '.'), sources: { priority: prio, mode } }));
      toast('Profil gespeichert');
      loadMeta();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      busy = false;
    }
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= prio.length) return;
    const a = [...prio];
    [a[i], a[j]] = [a[j], a[i]];
    prio = a;
  }
  const dv = $derived(data?.derived);
</script>

<PageHead title="Profil" subtitle="Persönliche Angaben steuern Bewertungen, Ziele und Zonen" />

{#if !data}
  <Loading height={400} />
{:else}
  <div class="grid g3 stagger">
    <Card title="Persönliche Daten" icon="👤" accent="#94a3b8" class="span2">
      <form class="pf" onsubmit={save}>
        <label class="field span">Name<input bind:value={f.name} maxlength="100" /></label>
        <label class="field">Geburtsdatum<input type="date" bind:value={f.birthDate} max={today()} /></label>
        <label class="field">Geschlecht
          <select bind:value={f.sex}><option value="">–</option><option value="male">männlich</option><option value="female">weiblich</option></select>
        </label>
        <label class="field">Größe (cm)<input type="number" bind:value={f.heightCm} min="100" max="250" /></label>
        <label class="field">Gewicht (kg)<input inputmode="decimal" bind:value={f.weightKg} />
          <span class="tiny faint">{data.profile.weightFrom ? `letzte Messung ${fmtDateTime(data.profile.weightFrom)} – Änderung wird als neue Messung gespeichert` : 'wird als Messung gespeichert'}</span>
        </label>
        <label class="field span">Trainingsziel
          <select bind:value={f.trainingGoal}>
            <option value="aus">Kein Ziel (manuelles Schritte-Ziel)</option>
            <option value="normal">Normal – Gewicht halten</option>
            <option value="abnehmen">Abnehmen</option>
            <option value="stark_abnehmen">Stark abnehmen</option>
          </select>
        </label>
        <label class="field">Schritte-Ziel pro Tag<input type="number" bind:value={f.stepGoal} min="1000" max="50000" step="500" disabled={f.trainingGoal !== 'aus'} />
          {#if f.trainingGoal !== 'aus'}<span class="tiny faint">automatisch: {num(dv?.stepGoal)} (aus Ø {num(dv?.stepGoalBasis)} Schritten)</span>{/if}
        </label>
        <label class="field">Ziel-pH (von – bis)
          <span class="row"><input inputmode="decimal" bind:value={f.phTargetMin} placeholder="7,0" class="grow" /><span class="muted">–</span><input inputmode="decimal" bind:value={f.phTargetMax} placeholder="7,2" class="grow" /></span>
        </label>
        <div class="span"><button class="btn primary" type="submit" disabled={busy}>Speichern</button></div>
      </form>
    </Card>

    <Card title="Abgeleitete Werte" icon="🧮" accent="#22d3ee">
      <div class="grid g2" style="gap:16px">
        <Stat label="Alter" value={dv?.age ?? '–'} unit={dv?.age != null ? 'Jahre' : ''} />
        <Stat label="BMI" value={num(dv?.bmi, 1)} sub={dv?.bmiStatus || ''} />
        <Stat label="Max. Puls" value={dv?.maxHr ?? '–'} unit={dv?.maxHr ? 'bpm' : ''} sub="220 − Alter" />
        <Stat label="Ruhepuls-Ziel" value={dv?.restingRef ? `${dv.restingRef.okLo}–${dv.restingRef.okHi}` : '–'} unit={dv?.restingRef ? 'bpm' : ''} />
        <Stat label="Schritte-Ziel" value={num(dv?.stepGoal)} />
        <Stat label="pH-Ziel" value={dv?.phTarget ? `${num(dv.phTarget.min, 1)}–${num(dv.phTarget.max, 1)}` : '–'} />
      </div>
    </Card>

    <Card title="Datenquellen-Priorität" subtitle="Welche Quelle zählt, wenn mehrere Apps Schritte, Distanz oder Kalorien liefern" icon="🔀" accent="#a78bfa" class="span-all">
      <div class="prio-wrap">
        <div class="prio">
          {#each prio as p, i (p)}
            <div class="pr">
              <span class="rank">{i + 1}</span>
              <span class="grow">{PKG[p] || p}<span class="tiny faint mono" style="margin-left:8px">{p}</span></span>
              <button class="btn icon ghost" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Nach oben"><Icon name="arrowUp" size={16} /></button>
              <button class="btn icon ghost" disabled={i === prio.length - 1} onclick={() => move(i, 1)} aria-label="Nach unten"><Icon name="arrowDown" size={16} /></button>
            </div>
          {/each}
        </div>
        <div class="stack">
          <label class="opt"><input type="radio" bind:group={mode} value="priority" /> <span><b>Nach Priorität</b><br><span class="small muted">Pro Tag zählt die oberste Quelle mit Daten. Empfohlen: das Band zuerst, weil es den ganzen Tag getragen wird.</span></span></label>
          <label class="opt"><input type="radio" bind:group={mode} value="max" /> <span><b>Höchster Wert</b><br><span class="small muted">Pro Tag zählt die Quelle mit dem höchsten Wert (z. B. wenn das Band zeitweise nicht getragen wird).</span></span></label>
          <button class="btn primary" onclick={save} disabled={busy}>Übernehmen</button>
        </div>
      </div>
    </Card>
  </div>
{/if}

<style>
  .pf { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
  .pf .span { grid-column: 1 / -1; }
  @media (max-width: 720px) { .pf { grid-template-columns: 1fr; } }
  .prio-wrap { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; }
  @media (max-width: 860px) { .prio-wrap { grid-template-columns: 1fr; } }
  .prio { display: flex; flex-direction: column; gap: 6px; }
  .pr { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(148, 163, 184, 0.05); border: 1px solid var(--border); }
  .rank { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; background: rgba(167, 139, 250, 0.15); color: #c4b5fd; font-weight: 700; font-size: 12px; flex: none; }
  .opt { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); }
  .opt input { margin-top: 3px; accent-color: var(--accent); }
</style>
