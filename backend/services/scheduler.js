import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/init.js';
import { getRoutes } from './googleMaps.js';

const activeIntervals = new Map();

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
  const db = getDb();
  const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(jobId);
  if (!job) return;
  if (job.status !== 'running') return;

  const now = new Date().toISOString();
  const endTime = job.end_time ? new Date(job.end_time) : addDays(now, job.duration_days || 7);
  if (new Date(now) > endTime) {
    stopJob(jobId);
    return;
  }

  const routeCount = 1 + (job.additional_routes || 0);
  const routesToFetch = Math.min(routeCount, 3); // Google max 3 alternatives

  try {
    const routes = await getRoutes(job.start_location, job.end_location, {
      mode: job.navigation_type || 'driving',
      avoidHighways: !!job.avoid_highways,
      avoidTolls: !!job.avoid_tolls,
      alternatives: routesToFetch - 1,
    });
    if (!routes?.length) {
      console.warn(`[Scheduler] Job ${jobId}: No routes returned for ${job.start_location} → ${job.end_location}`);
      return;
    }
    const stmt = db.prepare(`
        INSERT INTO route_snapshots (id, job_id, route_index, collected_at, duration_seconds, distance_meters, route_details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const route of routes) {
        stmt.run(
          uuidv4(),
          jobId,
          route.routeIndex,
          now,
          route.durationSeconds,
          route.distanceMeters,
          JSON.stringify({ steps: route.steps, summary: route.summary })
        );
      }

    db.prepare('UPDATE collection_jobs SET updated_at = ? WHERE id = ?')
      .run(now, jobId);
    console.log(`[Scheduler] Job ${jobId}: Collected ${routes.length} route(s)`);
  } catch (err) {
    console.error(`[Scheduler] Job ${jobId} error:`, err.message);
  }
}

export async function startJob(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(jobId);
  if (!job) throw new Error('Job not found');
  if (job.status === 'running') return;

  if (activeIntervals.has(jobId)) {
    activeIntervals.get(jobId).stop();
    activeIntervals.delete(jobId);
  }

  db.prepare('UPDATE collection_jobs SET status = ? WHERE id = ?').run('running', jobId);

  const cronExpr = `*/${job.cycle_minutes || 60} * * * *`;
  const task = cron.schedule(cronExpr, () => runCollectionCycle(jobId));

  activeIntervals.set(jobId, task);
  await runCollectionCycle(jobId); // Run first collection immediately before returning
}

export function stopJob(jobId) {
  const task = activeIntervals.get(jobId);
  if (task) {
    task.stop();
    activeIntervals.delete(jobId);
  }
  const db = getDb();
  db.prepare('UPDATE collection_jobs SET status = ? WHERE id = ?').run('completed', jobId);
}

export function pauseJob(jobId) {
  const task = activeIntervals.get(jobId);
  if (task) {
    task.stop();
    activeIntervals.delete(jobId);
  }
  const db = getDb();
  db.prepare('UPDATE collection_jobs SET status = ? WHERE id = ?').run('paused', jobId);
}

export async function resumeJob(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(jobId);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'paused') return;

  await startJob(jobId);
}

export function getActiveJobs() {
  return Array.from(activeIntervals.keys());
}

/** Restore cron for jobs that were running before server restart */
export function restoreRunningJobs() {
  const db = getDb();
  const running = db.prepare("SELECT id FROM collection_jobs WHERE status = 'running'").all();
  for (const { id } of running) {
    try {
      const job = db.prepare('SELECT * FROM collection_jobs WHERE id = ?').get(id);
      if (!job) continue;
      const cronExpr = `*/${job.cycle_minutes || 60} * * * *`;
      const task = cron.schedule(cronExpr, () => runCollectionCycle(id));
      activeIntervals.set(id, task);
      runCollectionCycle(id); // Run immediately
      console.log(`[Scheduler] Restored job ${id}`);
    } catch (e) {
      console.error(`[Scheduler] Failed to restore job ${id}:`, e.message);
    }
  }
}
