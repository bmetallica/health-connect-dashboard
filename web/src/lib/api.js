// thin JSON client for /api/v2

function qs(params) {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const res = await fetch('/api/v2' + path + qs(params), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error((data && data.error) || `Fehler ${res.status}`);
  return data;
}

export const get = (path, params) => api(path, { params });
export const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path, body) => api(path, { method: 'DELETE', body });

export function url(path, params) {
  return '/api/v2' + path + qs(params);
}

// file downloads (CSV/PDF) – a plain navigation keeps the browser's download handling
export function download(path, params) {
  const a = document.createElement('a');
  a.href = url(path, params);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
