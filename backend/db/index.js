/**
 * Unified DB layer: uses PostgreSQL when DATABASE_URL is set, otherwise SQLite.
 * Exports async getDb() returning { query, queryOne, run } so one codebase works everywhere.
 */

import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import * as postgres from './postgres.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR
  ? (process.env.DATA_DIR.startsWith('/') ? process.env.DATA_DIR : join(process.cwd(), process.env.DATA_DIR))
  : join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'traffic.db');

let sqliteDb = null;

function getSqliteDb() {
  if (!sqliteDb) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    sqliteDb = new Database(dbPath);
  }
  return sqliteDb;
}

/** SQLite adapter: same async interface as Postgres */
function sqliteAdapter() {
  const db = getSqliteDb();
  return {
    query: (sql, params = []) => Promise.resolve(db.prepare(sql).all(...params)),
    queryOne: (sql, params = []) => Promise.resolve(db.prepare(sql).get(...params) ?? null),
    run: (sql, params = []) => Promise.resolve(db.prepare(sql).run(...params)),
  };
}

/** Postgres adapter */
function postgresAdapter() {
  return {
    query: (sql, params) => postgres.query(sql, params),
    queryOne: (sql, params) => postgres.queryOne(sql, params),
    run: (sql, params) => postgres.run(sql, params),
  };
}

export function usePostgres() {
  return !!process.env.DATABASE_URL;
}

let cachedDb = null;

/** Returns async DB adapter { query, queryOne, run }. Use: const db = await getDb(); await db.queryOne('SELECT ...', [id]); */
export async function getDb() {
  if (cachedDb) return cachedDb;
  if (usePostgres()) {
    cachedDb = postgresAdapter();
    return cachedDb;
  }
  cachedDb = sqliteAdapter();
  return cachedDb;
}

/** Initialize schema. Call once at startup. */
export async function initDatabase() {
  if (usePostgres()) {
    await postgres.initPostgres();
    console.log('[DB] Using PostgreSQL (DATABASE_URL)');
    return;
  }
  const { initDatabase: initSqlite } = await import('./init.js');
  initSqlite();
  console.log('[DB] Using SQLite at', dbPath);
}

export { dbPath };
