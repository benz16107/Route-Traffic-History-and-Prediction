import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { getRoutes } from './googleMaps.js';

const activeIntervals = new Map();

const MIN_CYCLE_SECONDS = Math.max(60, parseInt(process.env.MIN_CYCLE_SECONDS, 10) || 300);

function getCycleIntervalSeconds(job) {
  const sec = parseInt(job?.cycle_seconds, 10);
  const fromSec = !Number.isNaN(sec) && sec > 0 ? sec : null;
  const min = parseInt(job?.cycle_minutes, 10);
  const fromMin = !Number.isNaN(min) && min > 0 ? min * 60 : null;
  const raw = fromSec ?? fromMin ?? 3600;
  return Math.max(MIN_CYCLE_SECONDS, raw);
}

function addMinutes(dateStr, minutes) {
  const d = new Date(dateStr);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function runCollectionCycle(jobId) {
  const db = await getDb();
  const job = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [jobId]);
  if (!job) return;
  if (job.status !== 'running') return;

  const now = new Date().toISOString();
  const endTime = job.end_time ? new Date(job.end_time) : addDays(now, job.duration_days || 7);
  if (new Date(now) > endTime) {
    await stopJob(jobId);
    return;
  }

  try {
    const routes = await getRoutes(job.start_location, job.end_location, {
      mode: job.navigation_type || 'driving',
      avoidHighways: !!job.avoid_highways,
      avoidTolls: !!job.avoid_tolls,
    });
    if (!routes?.length) {
      console.warn(`[Scheduler] Job ${jobId}: No routes returned for ${job.start_location} → ${job.end_location}`);
      return;
    }
    for (const route of routes) {
      const routeDetails = {
        points: route.points ?? [],
        start: route.start ?? null,
        end: route.end ?? null,
        steps: route.steps ?? [],
        summary: route.summary ?? null,
      };
      await db.run(
        'INSERT INTO route_snapshots (id, job_id, route_index, collected_at, duration_seconds, distance_meters, route_details) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), jobId, route.routeIndex ?? 0, now, route.durationSeconds, route.distanceMeters, JSON.stringify(routeDetails)]
      );
    }
    await db.run('UPDATE collection_jobs SET updated_at = ? WHERE id = ?', [now, jobId]);
    console.log(`[Scheduler] Job ${jobId}: Collected ${routes.length} route(s)`);
  } catch (err) {
    console.error(`[Scheduler] Job ${jobId} error:`, err.message);
  }
}

export async function startJob(jobId) {
  const db = await getDb();
  const job = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [jobId]);
  if (!job) throw new Error('Job not found');
  if (job.status === 'running') return;

  if (activeIntervals.has(jobId)) {
    activeIntervals.get(jobId).stop();
    activeIntervals.delete(jobId);
  }

  await db.run('UPDATE collection_jobs SET status = ? WHERE id = ?', ['running', jobId]);

  const intervalSeconds = getCycleIntervalSeconds(job);
  const intervalMs = intervalSeconds * 1000;
  const id = setInterval(() => runCollectionCycle(jobId), intervalMs);
  activeIntervals.set(jobId, { stop: () => clearInterval(id) });
  await runCollectionCycle(jobId);
}

export async function stopJob(jobId) {
  const entry = activeIntervals.get(jobId);
  if (entry) {
    entry.stop();
    activeIntervals.delete(jobId);
  }
  const db = await getDb();
  await db.run('UPDATE collection_jobs SET status = ? WHERE id = ?', ['completed', jobId]);
}

export async function pauseJob(jobId) {
  const entry = activeIntervals.get(jobId);
  if (entry) {
    entry.stop();
    activeIntervals.delete(jobId);
  }
  const db = await getDb();
  await db.run('UPDATE collection_jobs SET status = ? WHERE id = ?', ['paused', jobId]);
}

export async function resumeJob(jobId) {
  const db = await getDb();
  const job = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [jobId]);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'paused') return;
  await startJob(jobId);
}

export function getActiveJobs() {
  return Array.from(activeIntervals.keys());
}

/** Restore intervals for jobs that were running before server restart */
export async function restoreRunningJobs() {
  const db = await getDb();
  const running = await db.query("SELECT id FROM collection_jobs WHERE status = 'running'");
  for (const { id } of running) {
    try {
      const job = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [id]);
      if (!job) continue;
      const intervalSeconds = getCycleIntervalSeconds(job);
      const intervalMs = intervalSeconds * 1000;
      const intervalId = setInterval(() => runCollectionCycle(id), intervalMs);
      activeIntervals.set(id, { stop: () => clearInterval(intervalId) });
      runCollectionCycle(id);
      console.log(`[Scheduler] Restored job ${id}`);
    } catch (e) {
      console.error(`[Scheduler] Failed to restore job ${id}:`, e.message);
    }
  }
}
