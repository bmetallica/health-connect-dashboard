'use strict';

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
const api = express();
api.use(express.json({ limit: '50mb', type: ['application/json', 'application/*+json', 'text/json'] }));

function handleIngest(req, res) {
  if (req.body === undefined) {
    return res.status(400).json({ error: 'No JSON body received. Please send with Content-Type: application/json.' });
  }
  ingest.ingest(req.body, req.get('x-source'))
    .then((r) => res.status(201).json({ ok: true, id: r.id, receivedAt: r.receivedAt }))
    .catch((e) => {
      log('[ingest] archive write failed:', e.message);
      res.status(500).json({ error: e.message });
    });
}
api.post(['/ingest', '/api/ingest', '/data', '/'], handleIngest);
api.get('/health', (req, res) => res.json({ ok: true, service: 'health-ingest', port: API_PORT, ready }));
api.get('/', (req, res) => res.json({ service: 'health-ingest', usage: 'POST /ingest with a JSON body (Health Connect export)' }));
api.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON: ' + err.message });
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
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
api.listen(API_PORT, () => log(`[api] ingest endpoint running on port ${API_PORT}`));
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
