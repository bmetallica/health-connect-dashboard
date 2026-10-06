<script>
  import { onMount } from 'svelte';
  import { get, put } from '../lib/api.js';
  import { app, href, toast } from '../lib/state.svelte.js';
  import { COLORS, STATUS, STAGES } from '../lib/theme.js';
  import { num, dur, fmtTime, fmtDayLong, timeAgo, relDay, dayKey, avg } from '../lib/format.js';
  import Card from '../components/Card.svelte';
  import ScoreRing from '../components/ScoreRing.svelte';
  import Spark from '../components/Spark.svelte';
  import Ticker from '../components/Ticker.svelte';
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import Status from '../components/Status.svelte';

  let d = $state(null);
  let tags = $state([]);
  let note = $state('');
  let tagIds = $state([]);
  let savedNote = '';
  let error = $state(null);

  async function load() {
    try {
      const [t, tg] = await Promise.all([get('/today'), get('/tags')]);
      d = t;
      tags = tg;
      const j = await get('/journal', { from: t.today, to: t.today });
      const e = j.entries[0];
      note = savedNote = (e && e.note) || '';
      tagIds = (e && e.tagIds) || [];
    } catch (e) {
      error = e.message;
    }
  }
  onMount(load);

  async function saveJournal(msg = true) {
    await put('/journal/' + d.today, { note, tagIds });
    savedNote = note;
    if (msg) toast('Tagebuch gespeichert');
  }
  function toggleTag(id) {
    tagIds = tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id];
    saveJournal(false).catch((e) => toast(e.message, 'err'));
  }

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    const n = d?.profile?.name ? ', ' + d.profile.name.split(' ')[0] : '';
    return (h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend') + n;
  });
  const days = $derived(d?.days || []);
  const todayRow = $derived(days[days.length - 1]);
  const s = $derived(d?.summary || {});
  const series = (f) => days.map(f);
  function trend(cur, list) {
    const ref = avg(list.filter((x) => x != null));
    if (cur == null || ref == null || !ref) return null;
    const p = ((cur - ref) / ref) * 100;
    return Math.abs(p) < 1 ? 0 : p;
  }
  const goal = $derived(d?.derived?.stepGoal || 10000);
  const stepsToday = $derived(todayRow?.steps ?? null);
  const parts = $derived([
    { key: 'schlaf', label: 'Schlaf', s: s.sleep, color: COLORS.sleep },
    { key: 'herz', label: 'Ruhepuls', s: s.resting, color: COLORS.hr },
    { key: 'aktivitaet', label: 'Aktivität', s: s.steps, color: COLORS.activity },
    { key: 'vitalwerte', label: 'SpO₂', s: s.spo2, color: COLORS.spo2 },
    { key: 'ph', label: 'pH', s: s.ph, color: COLORS.ph },
  ]);
  const sources = $derived(Object.entries(d?.lastBySource || {}).sort((a, b) => b[1].last.localeCompare(a[1].last)));
  const SOURCE_NAMES = { tasker: 'Health Connect (Tasker)', 'hc-bridge': 'HC Bridge (App)', 'ph-app': 'pH-App', unbekannt: 'Unbekannt' };
</script>

{#if error}
  <Card><p class="muted">Fehler: {error}</p></Card>
{:else if !d}
  <div class="stack"><Loading height={180} /><div class="grid g4"><Loading height={150} /><Loading height={150} /><Loading height={150} /><Loading height={150} /></div></div>
{:else}
  <div class="hello fade-in">
    <div>
      <h1>{greeting}</h1>
      <div class="muted">{fmtDayLong(d.today)}</div>
    </div>
  </div>

  <div class="stack stagger">
    <!-- scores -->
    <Card accent={s.overall ? STATUS[s.overall.status].color : null}>
      <div class="scores">
        <div class="overall">
          <ScoreRing score={s.overall?.total} status={s.overall?.status} size={150} stroke={12} label="Gesamt" sub={s.overall ? STATUS[s.overall.status].label : 'keine Daten'} />
          <div class="ov-text">
            <h2>Deine Woche</h2>
            <p class="muted small">Bewertung aus den letzten 7 Tagen (pH: 30 Tage), abgestimmt auf dein Profil.</p>
          </div>
        </div>
        <div class="minis">
          {#each parts as p}
            <a class="mini" href={href(p.key)}>
              <ScoreRing score={p.s?.total} status={p.s?.status} size={74} stroke={7} />
              <span>{p.label}</span>
            </a>
          {/each}
        </div>
      </div>
    </Card>

    <!-- tiles -->
    <div class="grid g3 tiles">
      <a class="tile" href={href('herz')} style="--c:{COLORS.hr}">
        <div class="th"><span class="ti"><Icon name="heart" size={17} /></span>Puls</div>
        <div class="tv"><Ticker value={d.latest.hr?.value} /><span class="u">bpm</span></div>
        <div class="ts muted">{d.latest.hr ? `${relDay(dayKey(d.latest.hr.time))} ${fmtTime(d.latest.hr.time)}` : 'keine Daten'} · Ruhepuls Ø {num(s.resting?.resting)}</div>
        <Spark values={series((x) => x.resting?.value)} color={COLORS.hr} width={260} height={38} />
      </a>

      <a class="tile" href={href('aktivitaet')} style="--c:{COLORS.steps}">
        <div class="th"><span class="ti"><Icon name="activity" size={17} /></span>Schritte heute</div>
        <div class="tv"><Ticker value={stepsToday ?? 0} /><span class="u">/ {num(goal)}</span></div>
        <div class="prog"><div style="width:{Math.min(100, ((stepsToday || 0) / goal) * 100)}%"></div></div>
        <div class="ts muted">Ø 7 Tage {num(s.steps?.avg7)} · Serie {s.steps?.streak ?? 0} Tage</div>
        <Spark values={series((x) => x.steps)} color={COLORS.steps} width={260} height={30} />
      </a>

      <a class="tile" href={href('schlaf')} style="--c:{COLORS.sleep}">
        <div class="th"><span class="ti"><Icon name="moon" size={17} /></span>Letzte Nacht</div>
        {#if d.lastNight}
          <div class="tv">{dur(d.lastNight.totalMs)}</div>
          <div class="stagebar">
            {#each Object.entries(d.lastNight.stages).sort((a, b) => (STAGES[a[0]]?.order ?? 9) - (STAGES[b[0]]?.order ?? 9)) as [k, ms]}
              <div style="flex:{ms};background:{STAGES[k]?.color || '#475569'}" title="{STAGES[k]?.label}: {dur(ms)}"></div>
            {/each}
          </div>
          <div class="ts muted">{fmtTime(d.lastNight.start)} – {fmtTime(d.lastNight.end)} · Bewertung {d.lastNight.score.total} {#if d.lastNight.day !== d.today}({relDay(d.lastNight.day)}){/if}</div>
        {:else}
          <div class="tv muted">–</div>
          <div class="ts muted">keine Schlafdaten</div>
        {/if}
        <Spark values={series((x) => (x.sleep ? x.sleep.totalMs / 3600000 : null))} color={COLORS.sleep} width={260} height={30} />
      </a>

      <a class="tile" href={href('vitalwerte')} style="--c:{COLORS.spo2}">
        <div class="th"><span class="ti"><Icon name="vitals" size={17} /></span>Sauerstoff (SpO₂)</div>
        <div class="tv"><Ticker value={d.latest.spo2?.value} /><span class="u">%</span></div>
        <div class="ts muted">{d.latest.spo2 ? timeAgo(d.latest.spo2.time) : 'keine Daten'} · Ø 7 Tage {num(s.spo2?.avg, 1)} %</div>
        <Spark values={series((x) => x.spo2?.avg)} color={COLORS.spo2} width={260} height={38} />
      </a>

      <a class="tile" href={href('ph')} style="--c:{COLORS.ph}">
        <div class="th"><span class="ti"><Icon name="flask" size={17} /></span>pH-Wert</div>
        <div class="tv"><Ticker value={d.latest.ph?.value} digits={1} />
          {#if s.ph?.latest?.status}<Status status={s.ph.latest.status} text={s.ph.latest.deviation === 0 ? 'im Ziel' : null} />{/if}
        </div>
        <div class="ts muted">{d.latest.ph ? `${relDay(dayKey(d.latest.ph.time))} ${fmtTime(d.latest.ph.time)}` : 'keine Messung'}{#if d.derived.phTarget} · Ziel {num(d.derived.phTarget.min, 1)}–{num(d.derived.phTarget.max, 1)}{/if}</div>
        <Spark values={series((x) => x.phAvg)} color={COLORS.ph} width={260} height={38} />
      </a>

      <a class="tile" href={href('koerper')} style="--c:{COLORS.weight}">
        <div class="th"><span class="ti"><Icon name="body" size={17} /></span>Gewicht</div>
        <div class="tv"><Ticker value={d.latest.weight?.value} digits={1} /><span class="u">kg</span></div>
        <div class="ts muted">{d.latest.weight ? relDay(dayKey(d.latest.weight.time)) : 'noch kein Eintrag'}{#if d.derived.bmi} · BMI {num(d.derived.bmi, 1)}{/if}</div>
        <Spark values={series((x) => x.weight)} color={COLORS.weight} width={260} height={38} />
      </a>
    </div>

    <div class="grid g2">
      <!-- journal -->
      <Card title="Tagebuch heute" icon="📓" accent={COLORS.journal}>
        {#snippet actions()}<a class="btn sm ghost" href={href('tagebuch')}>Alle Tage</a>{/snippet}
        <div class="tags">
          {#each tags as t}
            <button class="chip click" class:on={tagIds.includes(t.id)} style="--tc:{t.color}" onclick={() => toggleTag(t.id)}>
              <span class="dot" style="background:{t.color}"></span>{t.name}
            </button>
          {/each}
        </div>
        <textarea bind:value={note} placeholder="Wie geht es dir heute? Besonderheiten, Essen, Medikamente …" rows="3" onblur={() => note !== savedNote && saveJournal()}></textarea>
      </Card>

      <!-- sources -->
      <Card title="Datenquellen" icon="🔄" accent="#64748b">
        {#snippet actions()}<a class="btn sm ghost" href={href('daten/quellen')}>Details</a>{/snippet}
        {#if sources.length}
          <div class="src">
            {#each sources as [k, v]}
              <div class="row between">
                <span class="row"><span class="dot" style="background:{Date.now() - Date.parse(v.last) < 6 * 3600000 ? 'var(--ok)' : 'var(--faint)'}"></span>{SOURCE_NAMES[k] || k}</span>
                <span class="muted small">{timeAgo(Date.parse(v.last))}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted small">Noch keine Daten empfangen.</p>
        {/if}
      </Card>
    </div>
  </div>
{/if}

<style>
  .hello { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 18px; }
  .hello h1 { font-size: 28px; }
  @media (max-width: 960px) { .hello h1 { font-size: 22px; } }
  .scores { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .overall { display: flex; align-items: center; gap: 22px; }
  .ov-text { max-width: 260px; }
  .ov-text h2 { margin-bottom: 4px; }
  .minis { display: flex; gap: 14px; flex-wrap: wrap; }
  .mini { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 600; padding: 6px; border-radius: 14px; transition: background 0.15s; }
  .mini:hover { background: rgba(148, 163, 184, 0.06); color: var(--text); }
  @media (max-width: 720px) {
    .overall { flex-direction: column; text-align: center; width: 100%; }
    .minis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); width: 100%; gap: 0; }
    .mini { padding: 2px 0; font-size: 11px; }
    .mini :global(.ring) { transform: scale(0.74); margin: -10px; }
  }
  .tiles .tile { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px 14px; background: linear-gradient(160deg, color-mix(in srgb, var(--c) 9%, transparent), transparent 55%), var(--panel); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; min-width: 0; overflow: hidden; }
  .tiles .tile:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 40%, transparent); box-shadow: var(--shadow); }
  .th { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-2); }
  .ti { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .tv { font-size: 32px; font-weight: 750; letter-spacing: -0.03em; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; line-height: 1.1; margin-top: 4px; }
  .u { font-size: 14px; color: var(--muted); font-weight: 550; letter-spacing: 0; }
  .ts { font-size: 12.5px; }
  .tile :global(.spark) { margin-top: auto; width: 100%; }
  .prog { height: 7px; border-radius: 7px; background: rgba(148, 163, 184, 0.12); overflow: hidden; }
  .prog div { height: 100%; border-radius: 7px; background: linear-gradient(90deg, #22c55e, var(--c)); animation: grow 1s cubic-bezier(.2,.8,.2,1) both; transform-origin: left; }
  @keyframes grow { from { transform: scaleX(0); } }
  .stagebar { display: flex; height: 10px; border-radius: 6px; overflow: hidden; gap: 2px; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .chip.on { background: color-mix(in srgb, var(--tc) 22%, transparent); border-color: var(--tc); color: var(--text); }
  .src { display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; }
</style>
