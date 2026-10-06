'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const archive = require('./archive');
const ingest = require('./ingest');
const settings = require('./settings');
const { router, csvHandler } = require('./api');

const API_PORT = parseInt(process.env.API_PORT || '8321', 10);
const WEB_PORT = parseInt(process.env.WEB_PORT || '8322', 10);
const WEB_DIST = process.env.WEB_DIST || path.join(__dirname, '..', 'web-dist');
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

let ready = false;

// ---------- ingest server (port 8321): accepts everything that arrives ----------
// This port is meant to be published to the internet (reverse proxy with HTTPS).
// It only takes data in: no GET routes, no details in responses, no framework
// error pages. Everything else stays on the web port, which is LAN only.
const INGEST_TOKEN = (process.env.INGEST_TOKEN || '').trim();
const INGEST_PATHS = ['/ingest', '/api/ingest', '/data', '/'];

function tokenOk(req) {
  if (!INGEST_TOKEN) return true;
  const auth = req.get('authorization') || '';
  const given = req.get('x-ingest-token') || (auth.startsWith('Bearer ') ? auth.slice(7) : '') || String(req.query.token || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(INGEST_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

const api = express();
api.disable('x-powered-by');
api.disable('etag');
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST' || !INGEST_PATHS.includes(req.path)) return res.status(404).end();
  if (!tokenOk(req)) return res.status(401).json({ ok: false });
  next();
});
// any content type is parsed as JSON (some senders do not set it correctly)
api.use(express.json({ limit: '50mb', type: () => true }));

const isEmpty = (b) => b == null || (Array.isArray(b) ? b.length === 0 : typeof b === 'object' && Object.keys(b).length === 0);

function handleIngest(req, res) {
  // empty payload = connection test of the apps, nothing to store
  if (isEmpty(req.body)) return res.status(200).json({ ok: true });
  ingest.ingest(req.body, req.get('x-source'))
    .then(() => res.status(201).json({ ok: true }))
    .catch((e) => {
      log('[ingest] archive write failed:', e.message);
      res.status(500).json({ ok: false });
    });
}
api.post(INGEST_PATHS, handleIngest);
api.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'invalid json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'too large' });
  log('[ingest] error:', err.message);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ ok: false });
});

// ---------- web server (port 8322) ----------
const web = express();
web.disable('x-powered-by');
web.use(express.json({ limit: '2mb' }));
web.get('/health', (req, res) => res.json({ ok: true, ready }));
web.use('/api', (req, res, next) => (ready ? next() : res.status(503).json({ error: 'Server startet noch …' })));
web.use('/api/v2', router);
web.get('/api/export.csv', (req, res, next) => csvHandler(req, res).catch(next)); // old URL
web.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
web.use(express.static(WEB_DIST, {
  index: false,
  setHeaders: (res, file) => {
    if (/[.-][0-9a-f]{8,}\./i.test(path.basename(file)) || file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
// SPA fallback
web.get('*', (req, res) => {
  const index = path.join(WEB_DIST, 'index.html');
  if (fs.existsSync(index)) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(index);
  }
  res.status(503).send('Frontend nicht gebaut');
});
web.use((err, req, res, next) => {
  log('[web] error:', req.method, req.originalUrl, err.stack || err.message);
  res.status(500).json({ error: err.message || 'Serverfehler' });
});

// the ingest endpoint must accept data from the first second, even while the
// database is still starting (records are archived and processed later)
api.listen(API_PORT, () => log(`[api] ingest endpoint running on port ${API_PORT}${INGEST_TOKEN ? ' (token required)' : ''}`));
web.listen(WEB_PORT, () => log(`[web] web interface running on port ${WEB_PORT}`));

async function start() {
  try {
    await archive.importLegacy(log);
    await db.waitForDb(log);
    await db.migrate(log);
    await settings.migrateProfileFile(log);
    ready = true;
    log('[app] ready');
    await ingest.reprocessUnknown();
    await ingest.catchUp();
  } catch (e) {
    log('[app] startup step failed, retrying in 30 s:', e.stack || e.message);
    setTimeout(start, 30000);
  }
}
start();

process.on('SIGTERM', () => process.exit(0));
