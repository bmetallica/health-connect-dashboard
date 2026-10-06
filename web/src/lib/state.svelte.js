// global app state (Svelte 5 runes)
import { get } from './api.js';
import { setTimeZone } from './format.js';

export const app = $state({
  meta: null,
  route: { path: 'heute', query: {} },
  toasts: [],
  metaError: null,
});

let toastId = 0;
export function toast(text, kind = 'ok', ms = 3200) {
  const id = ++toastId;
  app.toasts.push({ id, text, kind });
  setTimeout(() => {
    const i = app.toasts.findIndex((t) => t.id === id);
    if (i !== -1) app.toasts.splice(i, 1);
  }, ms);
}

export async function loadMeta() {
  try {
    const m = await get('/meta');
    setTimeZone(m.tz);
    app.meta = m;
    app.metaError = null;
  } catch (e) {
    app.metaError = e.message;
  }
  return app.meta;
}

// ---------- hash router: #/pfad/unterpfad?x=1 ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?');
  return { path: p || 'heute', query: Object.fromEntries(new URLSearchParams(q || '')) };
}
export function initRouter() {
  const apply = () => {
    app.route = parseHash();
  };
  window.addEventListener('hashchange', apply);
  apply();
}
export function navigate(path, query) {
  const q = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  location.hash = '#/' + path + (q.length > 1 ? q : '');
}
export function href(path, query) {
  const q = query ? new URLSearchParams(query).toString() : '';
  return '#/' + path + (q ? '?' + q : '');
}
