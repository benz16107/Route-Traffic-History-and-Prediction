import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase, getDb } from './db/index.js';
import { startJob, stopJob, pauseJob, resumeJob, restoreRunningJobs } from './services/scheduler.js';
import { getRoutePolyline, reverseGeocode } from './services/googleMaps.js';
import { mkdirSync, existsSync } from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
// Behind a reverse proxy (e.g. DigitalOcean); trust X-Forwarded-* so rate limiter sees real client IP
if (isProduction) app.set('trust proxy', 1);
const authPassword = (process.env.AUTH_PASSWORD || '').trim();
const googleClientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const googleClientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
// Auth required when: legacy single password, Google OAuth, or user accounts (sign up) are available
const authEnabled = authPassword.length > 0 || googleClientId.length > 0 || true;

const sessionSecret = process.env.AUTH_SECRET || process.env.AUTH_PASSWORD || 'routewatch-session-secret';
if (isProduction && authEnabled && sessionSecret === 'routewatch-session-secret') {
  console.warn('[Security] Set AUTH_SECRET or AUTH_PASSWORD in production. Using default session secret is unsafe.');
}

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

const corsOrigin = process.env.FRONTEND_URL || true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Rate limit auth endpoints to reduce brute-force and abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// Cookie-based session so login persists across multiple app instances (e.g. DigitalOcean).
// When frontend and backend are on different origins (FRONTEND_URL set), use sameSite: 'none'
// so the browser sends the cookie on cross-origin API requests; otherwise /api/auth/me would not see the session.
const cookieSameSite = isProduction && process.env.FRONTEND_URL ? 'none' : 'lax';
app.use(cookieSession({
  name: 'routewatch.sid',
  keys: [sessionSecret],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: isProduction,
  sameSite: cookieSameSite,
}));

// Startup log: confirm whether auth env vars are visible (check deploy logs if login page says "no sign-in method")
console.log('[Auth] passwordAuth:', authPassword.length > 0 ? 'yes' : 'no', '| googleAuth:', googleClientId.length > 0 ? 'yes' : 'no');
if (isProduction && googleClientId.length > 0) {
  if (!process.env.BACKEND_URL) console.warn('[Google OAuth] Set BACKEND_URL to your public backend URL so the OAuth redirect URI matches Google Console.');
  if (!process.env.FRONTEND_URL) console.warn('[Google OAuth] If frontend and backend are on different hosts, set FRONTEND_URL so the session cookie works after login. See DEPLOYMENT-GOOGLE-LOGIN.md');
}

// Log and normalize 500 errors; in production do not leak internal messages to client
function handleError(res, e, context = '') {
  const msg = e?.message || String(e);
  console.error(`[API Error]${context ? ` ${context}:` : ''}`, msg);
  const clientMessage = isProduction ? 'An error occurred. Please try again.' : msg;
  res.status(500).json({ error: clientMessage });
}

// Pick value from row by key (case-insensitive); SQLite/drivers may return different key casing
function pick(row, ...possibleKeys) {
  if (!row || typeof row !== 'object') return null;
  const lower = (s) => String(s).toLowerCase();
  for (const key of possibleKeys) {
    const want = lower(key);
    for (const k of Object.keys(row)) {
      if (lower(k) === want) {
        const v = row[k];
        return v === undefined ? null : v;
      }
    }
  }
  return null;
}

// Normalize job so frontend always gets name, start_name, end_name with correct keys; omit user_id from response
function toJobResponse(row) {
  if (!row) return row;
  const nameVal = pick(row, 'name', 'routeName');
  const startNameVal = pick(row, 'start_name', 'startName');
  const endNameVal = pick(row, 'end_name', 'endName');
  const strOrNull = (v) => (v == null || (typeof v === 'string' && !v.trim())) ? null : String(v).trim();
  const { user_id: _uid, ...rest } = row;
  return {
    ...rest,
    name: strOrNull(nameVal),
    start_name: strOrNull(startNameVal),
    end_name: strOrNull(endNameVal),
  };
}

// ----- Auth (optional: AUTH_PASSWORD and/or Google OAuth) -----
function isAuthenticated(req) {
  return !!(req.session?.authenticated || req.session?.user);
}

app.get('/api/auth/config', (req, res) => {
  res.json({
    passwordAuth: true, // email/password sign up & login
    googleAuth: googleClientId.length > 0,
  });
});

app.get('/api/auth/me', async (req, res) => {
  if (!authEnabled) return res.json({ ok: true, authEnabled: false });
  if (isAuthenticated(req)) {
    const sessionUser = req.session?.user || null;
    let hasPassword = false;
    if (sessionUser?.email) {
      const db = await getDb();
      // Case-insensitive email lookup (session may have different casing); pick() handles DB column casing (e.g. PostgreSQL)
      const row = await db.queryOne('SELECT password_hash FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))', [sessionUser.email]);
      const passwordHash = row ? pick(row, 'password_hash') : null;
      hasPassword = !!(passwordHash != null && String(passwordHash).length > 0);
    }
    return res.json({
      ok: true,
      authEnabled: true,
      user: sessionUser ? { ...sessionUser, hasPassword } : null,
    });
  }
  res.status(401).json({ error: 'Not authenticated', authEnabled: true });
});

app.post('/api/auth/login', async (req, res) => {
  const email = (typeof req.body?.email === 'string' ? req.body.email : '').trim().toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!authEnabled) return res.json({ ok: true, authEnabled: false });
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = await getDb();
  const userRow = await db.queryOne('SELECT id, email, name, password_hash FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))', [email]);
  if (!userRow) {
    if (authPassword.length > 0 && password === authPassword) {
      req.session.authenticated = true;
      return res.json({ ok: true, authEnabled: true });
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const passwordHash = pick(userRow, 'password_hash');
  if (!passwordHash) return res.status(401).json({ error: 'This account uses Google sign-in. Use Log in with Google.' });
  const match = await bcrypt.compare(password, passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });
  req.session.authenticated = true;
  req.session.user = { email: userRow.email, name: userRow.name || null, picture: null };
  res.json({ ok: true, authEnabled: true, user: req.session.user });
});

app.post('/api/auth/register', async (req, res) => {
  const name = (typeof req.body?.name === 'string' ? req.body.name : '').trim();
  const email = (typeof req.body?.email === 'string' ? req.body.email : '').trim().toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!authEnabled) return res.status(400).json({ error: 'Registration not available' });
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const db = await getDb();
  const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Log in or use a different email.' });
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.run('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)', [id, email, name || null, passwordHash]);
  req.session.authenticated = true;
  req.session.user = { email, name: name || null, picture: null };
  res.status(201).json({ ok: true, authEnabled: true, user: req.session.user });
});

app.post('/api/auth/change-password', async (req, res) => {
  if (!authEnabled) return res.status(400).json({ error: 'Not available' });
  if (!isAuthenticated(req) || !req.session?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current password and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const db = await getDb();
  const email = req.session.user.email;
  // Case-insensitive lookup; pick() handles DB column casing (e.g. PostgreSQL)
  const row = await db.queryOne('SELECT id, password_hash FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))', [email]);
  const passwordHash = row ? pick(row, 'password_hash') : null;
  if (!row || !passwordHash) return res.status(400).json({ error: 'This account uses Google sign-in. Password cannot be changed.' });
  const match = await bcrypt.compare(currentPassword, passwordHash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
  const newHash = await bcrypt.hash(newPassword, 10);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, row.id]);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// Debug: see exact redirect_uri this app uses (add this exact URL to Google Console). Disabled in production.
app.get('/api/auth/google/redirect-uri', (req, res) => {
  if (isProduction) return res.status(404).json({ error: 'Not found' });
  const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${backendUrl}/api/auth/google/callback`;
  res.json({ redirect_uri: redirectUri, backend_url: backendUrl });
});

// Signed OAuth state (no session needed – works when callback hits another instance or cookie missing)
function signState(state) {
  const sig = crypto.createHmac('sha256', sessionSecret).update(state).digest('hex');
  return `${state}.${sig}`;
}
function verifyState(signedState) {
  if (typeof signedState !== 'string') return false;
  const i = signedState.lastIndexOf('.');
  if (i <= 0) return false;
  const state = signedState.slice(0, i);
  const sig = signedState.slice(i + 1);
  const expected = crypto.createHmac('sha256', sessionSecret).update(state).digest('hex');
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// Google OAuth: redirect user to Google
app.get('/api/auth/google', (req, res) => {
  if (!googleClientId.length) return res.status(501).json({ error: 'Google Sign-In not configured' });
  const state = crypto.randomBytes(24).toString('hex');
  const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${backendUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: googleClientId,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state: signState(state),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Where to send the user after OAuth: prefer FRONTEND_URL; in local dev (backend on 3001) always use Vite on 5173
function getFrontendUrl(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const host = (req.get('host') || '').toLowerCase();
  if (host.endsWith(':3001')) return 'http://localhost:5173';
  return `${req.protocol}://${req.get('host')}`;
}

// Google OAuth: callback – exchange code for tokens, fetch user, set session, redirect to app
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state: signedState } = req.query;
  const frontendUrl = getFrontendUrl(req);
  if (!code || !signedState || !verifyState(signedState)) {
    return res.redirect(`${frontendUrl}?auth_error=invalid_callback`);
  }
  const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${backendUrl}/api/auth/google/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('[Google OAuth] Token exchange failed:', err);
    return res.redirect(`${frontendUrl}?auth_error=token_exchange`);
  }
  const tokens = await tokenRes.json();
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    console.error('[Google OAuth] Userinfo failed');
    return res.redirect(`${frontendUrl}?auth_error=userinfo`);
  }
  const user = await userRes.json();
  const email = (user.email || '').trim().toLowerCase();
  if (!email) return res.redirect(`${frontendUrl}?auth_error=userinfo`);
  const db = await getDb();
  let userRow = await db.queryOne('SELECT id, email, name FROM users WHERE email = ?', [email]);
  if (!userRow) {
    const id = uuidv4();
    await db.run('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, NULL)', [id, email, (user.name || '').trim() || null]);
    userRow = await db.queryOne('SELECT id, email, name FROM users WHERE email = ?', [email]);
  }
  req.session.authenticated = true;
  req.session.user = {
    email: userRow.email,
    name: userRow.name || user.name || null,
    picture: user.picture || null,
  };
  res.redirect(frontendUrl);
});

function requireAuth(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  if (req.path.startsWith('/api/auth')) return next();
  if (!authEnabled) return next();
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Not authenticated', authEnabled: true });
}
app.use(requireAuth);

/** Current user id for scoping routes: Google email, password-user = 'default', auth off = 'anonymous'. */
function getCurrentUserId(req) {
  if (!authEnabled) return 'anonymous';
  if (req.session?.user?.email) return req.session.user.email;
  if (req.session?.authenticated) return 'default';
  return 'anonymous';
}

/** Ensure job belongs to current user; returns job or null. */
async function getJobForUser(db, jobId, userId) {
  const job = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ? AND user_id = ?', [jobId, userId]);
  return job || null;
}

// API: List jobs (only current user's)
app.get('/api/jobs', async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const db = await getDb();
    const jobs = await db.query('SELECT * FROM collection_jobs WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    res.json(jobs.map(toJobResponse));
  } catch (e) {
    handleError(res, e, 'GET /api/jobs');
  }
});

// API: Get single job
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(toJobResponse(job));
  } catch (e) {
    handleError(res, e, 'GET /api/jobs/:id');
  }
});

// API: Create job
app.post('/api/jobs', async (req, res) => {
  try {
    const {
      name,
      start_name: bodyStartName,
      end_name: bodyEndName,
      start_location,
      end_location,
      start_time,
      end_time,
      cycle_minutes = 60,
      cycle_seconds = 0,
      duration_days = 7,
      navigation_type = 'driving',
      avoid_highways = false,
      avoid_tolls = false,
    } = req.body;

    if (!start_location || !end_location) {
      return res.status(400).json({ error: 'start_location and end_location required' });
    }

    const id = uuidv4();
    const userId = getCurrentUserId(req);
    const db = await getDb();
    const jobName = name != null && String(name).trim() !== '' ? String(name).trim() : null;
    const startName = (bodyStartName ?? req.body.startName) != null && String(bodyStartName ?? req.body.startName).trim() !== '' ? String(bodyStartName ?? req.body.startName).trim() : null;
    const endName = (bodyEndName ?? req.body.endName) != null && String(bodyEndName ?? req.body.endName).trim() !== '' ? String(bodyEndName ?? req.body.endName).trim() : null;
    await db.run(
      `INSERT INTO collection_jobs (id, user_id, name, start_name, end_name, start_location, end_location, start_time, end_time, cycle_minutes, cycle_seconds, duration_days, navigation_type, avoid_highways, avoid_tolls, additional_routes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, jobName, startName, endName, start_location, end_location, start_time || null, end_time || null, cycle_minutes, cycle_seconds || 0, duration_days, navigation_type, avoid_highways ? 1 : 0, avoid_tolls ? 1 : 0, 0]
    );

    const job = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [id]);
    res.status(201).json(toJobResponse(job));
  } catch (e) {
    handleError(res, e, 'POST /api/jobs');
  }
});

// API: Update job. Running jobs can be edited (name/start_name/end_name only); no 400.
app.patch('/api/jobs/:id', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body required' });
    }
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const isRunning = String(job.status).toLowerCase() === 'running';
    const strOrNull = (v) => (v === '' || v == null ? null : String(v).trim() || null);
    const body = req.body;

    const name = body.name ?? body.routeName;
    const start_name = body.start_name ?? body.startName;
    const end_name = body.end_name ?? body.endName;

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(body, 'name') || Object.prototype.hasOwnProperty.call(body, 'routeName')) {
      updates.push('name = ?');
      values.push(strOrNull(name));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'start_name') || Object.prototype.hasOwnProperty.call(body, 'startName')) {
      updates.push('start_name = ?');
      values.push(strOrNull(start_name));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'end_name') || Object.prototype.hasOwnProperty.call(body, 'endName')) {
      updates.push('end_name = ?');
      values.push(strOrNull(end_name));
    }

    if (!isRunning) {
      const allowed = ['start_location', 'end_location', 'start_time', 'end_time', 'cycle_minutes', 'cycle_seconds', 'duration_days', 'navigation_type', 'avoid_highways', 'avoid_tolls'];
      for (const k of allowed) {
        if (body[k] !== undefined) {
          updates.push(`${k} = ?`);
          const v = body[k];
          values.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
        }
      }
    }

    if (updates.length) {
      updates.push(process.env.DATABASE_URL ? 'updated_at = CURRENT_TIMESTAMP' : "updated_at = datetime('now')");
      values.push(req.params.id);
      await db.run(`UPDATE collection_jobs SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const updated = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [req.params.id]);
    res.json(toJobResponse(updated));
  } catch (e) {
    handleError(res, e, 'PATCH /api/jobs/:id');
  }
});

// API: Delete job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await stopJob(req.params.id);
    await db.run('DELETE FROM route_snapshots WHERE job_id = ?', [req.params.id]);
    await db.run('DELETE FROM collection_jobs WHERE id = ? AND user_id = ?', [req.params.id, getCurrentUserId(req)]);
    res.json({ ok: true });
  } catch (e) {
    handleError(res, e, 'DELETE /api/jobs/:id');
  }
});

// API: Start job
app.post('/api/jobs/:id/start', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await startJob(req.params.id);
    const updated = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [req.params.id]);
    res.json(toJobResponse(updated));
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/start');
  }
});

// API: Stop job
app.post('/api/jobs/:id/stop', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    stopJob(req.params.id);
    const updated = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [req.params.id]);
    res.json(toJobResponse(updated));
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/stop');
  }
});

// API: Pause job
app.post('/api/jobs/:id/pause', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    pauseJob(req.params.id);
    const updated = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [req.params.id]);
    res.json(toJobResponse(updated));
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/pause');
  }
});

// API: Resume job
app.post('/api/jobs/:id/resume', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await resumeJob(req.params.id);
    const updated = await db.queryOne('SELECT * FROM collection_jobs WHERE id = ?', [req.params.id]);
    res.json(toJobResponse(updated));
  } catch (e) {
    handleError(res, e, 'POST /api/jobs/:id/resume');
  }
});

// API: Place autocomplete (proxies to Google Places API for better address matching)
app.get('/api/place-autocomplete', async (req, res) => {
  try {
    const input = (req.query.input || '').trim();
    const country = (req.query.country || '').toLowerCase().replace(/[^a-z]/g, '');
    if (input.length < 3) {
      return res.json({ predictions: [] });
    }
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not configured' });
    }
    const params = new URLSearchParams({
      input,
      key: apiKey,
      types: 'geocode',
      language: 'en',
    });
    if (country.length === 2) {
      params.set('components', `country:${country}`);
    }
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`;
    const fetchRes = await fetch(url);
    const data = await fetchRes.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(data.error_message || data.status || 'Place autocomplete failed');
    }
    const predictions = (data.predictions || []).map((p) => ({
      description: p.description,
      place_id: p.place_id,
    }));
    res.json({ predictions });
  } catch (e) {
    handleError(res, e, 'GET /api/place-autocomplete');
  }
});

// API: Reverse geocode lat,lng to address (for "current location" button)
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng query parameters required' });
    }
    const address = await reverseGeocode(lat, lng);
    res.json({ address });
  } catch (e) {
    handleError(res, e, 'GET /api/reverse-geocode');
  }
});

// API: Get route polyline for map display (uses backend Directions API - no frontend key needed)
app.get('/api/route-preview', async (req, res) => {
  try {
    const { origin, destination, mode = 'driving', avoid_highways, avoid_tolls } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'origin and destination required' });
    }
    const opts = { mode, avoidHighways: !!avoid_highways, avoidTolls: !!avoid_tolls };
    const route = await getRoutePolyline(origin, destination, opts);
    if (!route) {
      console.warn('[route-preview] No route for:', origin, '→', destination);
      return res.status(404).json({ error: 'Route not found. Check that start and destination are valid addresses.' });
    }
    res.json(route);
  } catch (e) {
    handleError(res, e, 'GET /api/route-preview');
  }
});

// API: Get snapshots for job
app.get('/api/jobs/:id/snapshots', async (req, res) => {
  try {
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const snapshots = await db.query('SELECT * FROM route_snapshots WHERE job_id = ? ORDER BY collected_at ASC', [req.params.id]);
    res.json(snapshots);
  } catch (e) {
    handleError(res, e, 'GET /api/jobs/:id/snapshots');
  }
});

// API: Export job data (CSV or JSON)
app.get('/api/jobs/:id/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const db = await getDb();
    const job = await getJobForUser(db, req.params.id, getCurrentUserId(req));
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const snapshots = await db.query('SELECT * FROM route_snapshots WHERE job_id = ? ORDER BY collected_at ASC', [req.params.id]);

    if (format === 'csv') {
      const header = 'collected_at,duration_seconds,distance_meters,duration_minutes\n';
      const rows = snapshots
        .filter(s => (s.route_index ?? 0) === 0)
        .map(s =>
          `${s.collected_at},${s.duration_seconds},${s.distance_meters},${s.duration_seconds ? Math.round(s.duration_seconds / 60) : ''}`
        ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="job-${req.params.id}.csv"`);
      return res.send(header + rows);
    }

    res.json({ job: toJobResponse(job), snapshots });
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
(async () => {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    restoreRunningJobs().catch((e) => console.error('[Scheduler] restoreRunningJobs:', e.message));
  });
})();
