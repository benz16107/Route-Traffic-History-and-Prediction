import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase, getDb } from './db/init.js';
import { startJob, stopJob, pauseJob, resumeJob } from './services/scheduler.js';
import { getRoutePolyline } from './services/googleMaps.js';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

initDatabase();
const app = express();
app.use(cors());
app.use(express.json());

// Log and normalize 500 errors
function handleError(res, e, context = '') {
  const msg = e?.message || String(e);
  console.error(`[API Error]${context ? ` ${context}:` : ''}`, msg);
  res.status(500).json({ error: msg });
}

// API: List jobs
app.get('/api/jobs', (req, res) => {
  try {
    const db = getDb();
    const jobs = db.prepare('SELECT * FROM collection_jobs ORDER BY created_at DESC').all();
    res.json(jobs);
  } catch (e) {
    handleError(res, e, 'GET /api/jobs');
  }
});

// API: Get single job
app.get('/api/jobs/:id', (req, res) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (e) {
    handleError(res, e, 'GET /api/jobs/:id');
  }
});

// API: Create job
app.post('/api/jobs', (req, res) => {
  try {
    const {
      start_location,
      end_location,
      start_time,
      end_time,
      cycle_minutes = 60,
      duration_days = 7,
      navigation_type = 'driving',
      avoid_highways = false,
      avoid_tolls = false,
      additional_routes = 0,
    } = req.body;

    if (!start_location || !end_location) {
      return res.status(400).json({ error: 'start_location and end_location required' });
    }

    const id = uuidv4();
    const db = getDb();
    db.prepare(`
      INSERT INTO collection_jobs (id, start_location, end_location, start_time, end_time, cycle_minutes, duration_days, navigation_type, avoid_highways, avoid_tolls, additional_routes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      start_location,
      end_location,
      start_time || null,
      end_time || null,
      cycle_minutes,
      duration_days,
      navigation_type,
      avoid_highways ? 1 : 0,
      avoid_tolls ? 1 : 0,
      additional_routes
    );

    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(id);
    res.status(201).json(job);
  } catch (e) {
    handleError(res, e, 'POST /api/jobs');
  }
});

// API: Update job (only if not running)
app.patch('/api/jobs/:id', (req, res) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status === 'running') return res.status(400).json({ error: 'Cannot edit running job' });

    const allowed = ['start_location', 'end_location', 'start_time', 'end_time', 'cycle_minutes', 'duration_days', 'navigation_type', 'avoid_highways', 'avoid_tolls', 'additional_routes'];
    const updates = [];
    const values = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        updates.push(`${k} = ?`);
        values.push(typeof req.body[k] === 'boolean' ? (req.body[k] ? 1 : 0) : req.body[k]);
      }
    }
    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      values.push(req.params.id);
      db.prepare(`UPDATE collection_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (e) {
    handleError(res, e, 'PATCH /api/jobs/:id');
  }
});

// API: Delete job
app.delete('/api/jobs/:id', (req, res) => {
  try {
    stopJob(req.params.id);
    const db = getDb();
    db.prepare('DELETE FROM route_snapshots WHERE job_id = ?').run(req.params.id);
    const r = db.prepare('DELETE FROM collection_jobs WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Job not found' });
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e, 'DELETE /api/jobs/:id');
  }
});

// API: Start job
app.post('/api/jobs/:id/start', async (req, res) => {
  try {
    await startJob(req.params.id);
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    res.json(job);
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/start');
  }
});

// API: Stop job
app.post('/api/jobs/:id/stop', (req, res) => {
  try {
    stopJob(req.params.id);
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    res.json(job);
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/stop');
  }
});

// API: Pause job
app.post('/api/jobs/:id/pause', (req, res) => {
  try {
    pauseJob(req.params.id);
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    res.json(job);
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/pause');
  }
});

// API: Resume job
app.post('/api/jobs/:id/resume', async (req, res) => {
  try {
    await resumeJob(req.params.id);
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    res.json(job);
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/resume');
  }
});

// API: Get route polyline for map display (uses backend Directions API - no frontend key needed)
app.get('/api/route-preview', async (req, res) => {
  try {
    const { origin, destination, mode = 'driving', avoid_highways, avoid_tolls } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'origin and destination required' });
    }
    const route = await getRoutePolyline(origin, destination, {
      mode,
      avoidHighways: !!avoid_highways,
      avoidTolls: !!avoid_tolls,
    });
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json(route);
  } catch (e) {
    handleError(res, e, 'GET /api/route-preview');
  }
});

// API: Get snapshots for job
app.get('/api/jobs/:id/snapshots', (req, res) => {
  try {
    const db = getDb();
    const snapshots = db.prepare(
      'SELECT * FROM route_snapshots WHERE job_id = ? ORDER BY collected_at ASC'
    ).all(req.params.id);
    res.json(snapshots);
  } catch (e) {
    handleError(res, e, 'GET /api/jobs/:id/snapshots');
  }
});

// API: Export job data (CSV or JSON)
app.get('/api/jobs/:id/export', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const db = getDb();
    const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const snapshots = db.prepare(
      'SELECT * FROM route_snapshots WHERE job_id = ? ORDER BY collected_at ASC'
    ).all(req.params.id);

    if (format === 'csv') {
      const header = 'collected_at,route_index,duration_seconds,distance_meters,duration_minutes\n';
      const rows = snapshots.map(s =>
        `${s.collected_at},${s.route_index},${s.duration_seconds},${s.distance_meters},${s.duration_seconds ? Math.round(s.duration_seconds / 60) : ''}`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="job-${req.params.id}.csv"`);
      return res.send(header + rows);
    }

    res.json({ job, snapshots });
  } catch (e) {
    handleError(res, e, 'GET /api/jobs/:id/export');
  }
});

// Serve frontend in production
const frontendPath = join(__dirname, '..', 'frontend', 'dist');
if (existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(frontendPath, 'index.html'));
    }
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
