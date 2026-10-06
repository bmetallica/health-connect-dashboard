'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'health',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'health',
  connectionLimit: 8,
  supportBigNumbers: true,
  bigNumberStrings: false,
  charset: 'utf8mb4',
  timezone: 'Z',
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params) => (await conn.query(sql, params))[0];
    const out = await fn(q);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- schema migrations (append only, never edit an applied step) ----------
const MIGRATIONS = [
  // 1: initial schema
  [
    `CREATE TABLE samples (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      time BIGINT NOT NULL,
      value DOUBLE NULL,
      value2 DOUBLE NULL,
      source VARCHAR(128) NULL,
      received_at BIGINT NULL,
      manual TINYINT(1) NOT NULL DEFAULT 0,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      edit_time BIGINT NULL,
      edit_value DOUBLE NULL,
      edit_value2 DOUBLE NULL,
      edited_at BIGINT NULL,
      UNIQUE KEY uq_type_time (type, time),
      KEY idx_type_edit_time (type, edit_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE interval_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(128) NOT NULL,
      type VARCHAR(32) NOT NULL,
      start_time BIGINT NOT NULL,
      end_time BIGINT NOT NULL,
      value DOUBLE NOT NULL,
      source VARCHAR(128) NULL,
      last_modified BIGINT NULL,
      UNIQUE KEY uq_uid (uid),
      KEY idx_type_start (type, start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE day_overrides (
      type VARCHAR(32) NOT NULL,
      day CHAR(10) NOT NULL,
      value DOUBLE NOT NULL,
      original_value DOUBLE NULL,
      edited_at BIGINT NOT NULL,
      PRIMARY KEY (type, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE sleep_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      raw_start BIGINT NOT NULL,
      raw_end BIGINT NOT NULL,
      stages LONGTEXT NULL,
      source VARCHAR(128) NULL,
      hc_ids TEXT NULL,
      received_at BIGINT NULL,
      manual TINYINT(1) NOT NULL DEFAULT 0,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      edit_start BIGINT NULL,
      edit_end BIGINT NULL,
      edited_at BIGINT NULL,
      KEY idx_raw_start (raw_start),
      KEY idx_raw_end (raw_end)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE exercise_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(128) NOT NULL,
      exercise_type INT NULL,
      title VARCHAR(255) NULL,
      notes TEXT NULL,
      start_time BIGINT NOT NULL,
      end_time BIGINT NOT NULL,
      source VARCHAR(128) NULL,
      last_modified BIGINT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY uq_uid (uid),
      KEY idx_start (start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE day_notes (
      day CHAR(10) NOT NULL PRIMARY KEY,
      note TEXT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      color VARCHAR(16) NULL,
      sort INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE day_tags (
      day CHAR(10) NOT NULL,
      tag_id INT NOT NULL,
      PRIMARY KEY (day, tag_id),
      KEY idx_tag (tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE edit_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      at BIGINT NOT NULL,
      kind VARCHAR(32) NOT NULL,
      ref VARCHAR(64) NOT NULL,
      action VARCHAR(16) NOT NULL,
      field VARCHAR(32) NULL,
      old_value TEXT NULL,
      new_value TEXT NULL,
      device VARCHAR(255) NULL,
      KEY idx_at (at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE unknown_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(160) NOT NULL,
      record_type VARCHAR(96) NOT NULL,
      data LONGTEXT NOT NULL,
      received_at BIGINT NULL,
      UNIQUE KEY uq_uid (uid),
      KEY idx_type (record_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE raw_processed (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      processed_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE settings (
      k VARCHAR(64) NOT NULL PRIMARY KEY,
      v LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `INSERT INTO tags (name, color, sort) VALUES
      ('krank', '#f87171', 1), ('Alkohol', '#c084fc', 2), ('Sport', '#4ade80', 3),
      ('Stress', '#fb923c', 4), ('Medikament', '#60a5fa', 5), ('schlecht geschlafen', '#a78bfa', 6)`,
  ],
  // 2: longer action names in the edit log ("wiederhergestellt")
  ['ALTER TABLE edit_log MODIFY action VARCHAR(32) NOT NULL'],
];

async function waitForDb(log) {
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (i % 5 === 0) log(`[db] waiting for database: ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function migrate(log) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL)');
  const rows = await query('SELECT version FROM schema_version');
  let version = rows.length ? rows[0].version : 0;
  if (!rows.length) await query('INSERT INTO schema_version (version) VALUES (0)');
  while (version < MIGRATIONS.length) {
    const steps = MIGRATIONS[version];
    log(`[db] applying schema migration ${version + 1}`);
    for (const sql of steps) await pool.query(sql);
    version++;
    await query('UPDATE schema_version SET version = ?', [version]);
  }
}

async function getSetting(k, def = null) {
  const rows = await query('SELECT v FROM settings WHERE k = ?', [k]);
  if (!rows.length || rows[0].v == null) return def;
  try {
    return JSON.parse(rows[0].v);
  } catch {
    return def;
  }
}

async function setSetting(k, v) {
  await query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, JSON.stringify(v)]);
}

module.exports = { pool, query, tx, waitForDb, migrate, getSetting, setSetting };
