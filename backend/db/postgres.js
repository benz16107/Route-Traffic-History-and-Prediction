import pg from 'pg';

const { Pool } = pg;

let pool = null;

/** Convert ? placeholders to $1, $2, ... for pg */
function toPgSql(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required for PostgreSQL');
    pool = new Pool({ connectionString: url, ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined });
  }
  return pool;
}

export async function initPostgres() {
  const pool = getPool();
  const statements = [
    `CREATE TABLE IF NOT EXISTS collection_jobs (
      id TEXT PRIMARY KEY,
      name TEXT,
      start_name TEXT,
      end_name TEXT,
      start_location TEXT NOT NULL,
      end_location TEXT NOT NULL,
      start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMPTZ,
      cycle_minutes INTEGER DEFAULT 60,
      cycle_seconds INTEGER DEFAULT 0,
      duration_days INTEGER DEFAULT 7,
      navigation_type TEXT DEFAULT 'driving',
      avoid_highways INTEGER DEFAULT 0,
      avoid_tolls INTEGER DEFAULT 0,
      additional_routes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT DEFAULT 'anonymous'
    )`,
    `CREATE TABLE IF NOT EXISTS route_snapshots (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      route_index INTEGER DEFAULT 0,
      collected_at TEXT NOT NULL,
      duration_seconds INTEGER,
      distance_meters INTEGER,
      route_details TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES collection_jobs(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_snapshots_job_collected ON route_snapshots(job_id, collected_at)`,
    `CREATE INDEX IF NOT EXISTS idx_snapshots_job_id ON route_snapshots(job_id)`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  ];
  for (const sql of statements) {
    await pool.query(sql);
  }
}

export async function query(sql, params = []) {
  const res = await getPool().query(toPgSql(sql), params);
  return res.rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function run(sql, params = []) {
  await getPool().query(toPgSql(sql), params);
  return {};
}
