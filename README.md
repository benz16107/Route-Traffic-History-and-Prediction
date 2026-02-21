# RouteWatch

Collect, store, and visualize route travel times between locations using the Google Maps Directions API. Schedule automated data collection and view historical trends for driving, walking, or transit.

## Features

- **Create collection jobs** — Start/destination (address autocomplete), cycle interval (minutes or seconds), duration, navigation type (driving, walking, transit)
- **Route preferences** — Avoid highways, avoid tolls (driving only)
- **Live monitoring** — Current cycle data, countdown to next collection, status badges
- **Timeline chart** — Travel time over the collected period (Recharts)
- **Per-snapshot details** — Expand any row to see route map + turn-by-turn directions
- **Export** — CSV or JSON download of collected data
- **Job control** — Start, pause, resume, stop collection
- **Current location** — One-tap geolocation for start address

## Tech Stack

| Layer    | Technology                                |
|----------|-------------------------------------------|
| Backend  | Node.js, Express, SQLite (better-sqlite3) |
| Scheduler| setInterval (in-process, survives restart) |
| Frontend | React, Vite, Recharts, Leaflet            |
| Maps     | Google Directions API, Places Autocomplete|

## Setup

### 1. Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Google Maps API

- Create a [Google Cloud project](https://console.cloud.google.com/)
- Enable: **Directions API**, **Maps JavaScript API**, **Places API**
- Create an API key (or two: one for backend, one for frontend with referrer restrictions)

### 3. Environment

```bash
cp .env.example .env
# Edit .env and set:
# GOOGLE_MAPS_API_KEY  - backend (Directions API)
# VITE_GOOGLE_MAPS_API_KEY - frontend (Places + Maps), if using a separate key
# AUTH_PASSWORD - optional; set to require a password to use the app (see Authentication below)
```

### 4. Initialize database

```bash
npm run db:init
```

## Run

```bash
npm run dev
```

- **Backend:** http://localhost:3001
- **Frontend (Vite):** http://localhost:5173 (or next free port, e.g. 5174); proxies `/api` to backend

**Why does 3001 show an old UI?** The backend serves the built frontend from `frontend/dist`. That folder is only updated when you run `npm run build` in the frontend. While developing, use the Vite URL (e.g. 5174) to see live changes. To see your latest UI on 3001, run `npm run build` from the repo root (or `cd frontend && npm run build`), then reload http://localhost:3001.

## Reducing API cost

Google Maps APIs (Directions, Geocoding, Places) are billed per request. This app reduces cost by:

- **Geocoding & reverse geocode** — Cached 24h in memory (same address = one API call per day).
- **Route preview (map polyline)** — Cached 5 min so opening the same route map doesn’t re-call Directions.
- **Collection interval** — Server enforces a minimum interval (default **5 minutes**). Set `MIN_CYCLE_SECONDS=300` in `.env` (or higher, e.g. 600 for 10 min). Jobs set to 1 min will still run at most every 5 min.
- **Place autocomplete** — Requests only after 3 characters and 400 ms debounce to limit Places API calls.

Set billing alerts and quotas in [Google Cloud Console](https://console.cloud.google.com/billing) to avoid surprises.

## Authentication

Auth is **optional**. By default the app has no login; anyone with the URL can use it.

You can enable one or both:

### Password (single shared password)

1. Set **`AUTH_PASSWORD`** in `.env` (e.g. `AUTH_PASSWORD=my_secret`).
2. Restart the server. The sign-in page will show a password field.
3. (Optional) Set **`AUTH_SECRET`** for session signing; if unset, `AUTH_PASSWORD` is used.

### Google Sign-In (for public or multi-user use)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** (Application type: **Web application**).
2. Under **Authorized redirect URIs**, add:
   - Production: `https://your-domain.com/api/auth/google/callback`
   - Local: `http://localhost:3001/api/auth/google/callback`
3. In `.env` set **`GOOGLE_OAUTH_CLIENT_ID`** and **`GOOGLE_OAUTH_CLIENT_SECRET`** (from the OAuth client).
4. Restart the server. The sign-in page will show **Sign in with Google**; after consent, users are signed in with their Google account (email shown in the header).

If frontend and backend are on different hosts (e.g. DigitalOcean with separate frontend/backend apps), set **`BACKEND_URL`** and **`FRONTEND_URL`** on the backend so the OAuth callback and session cookie work; set **`VITE_API_URL`** when building the frontend so API calls go to your backend. **→ Full checklist:** [DEPLOYMENT-GOOGLE-LOGIN.md](DEPLOYMENT-GOOGLE-LOGIN.md)

**Local testing with Google Sign-In:** Use the built app on one origin so the session cookie works: run `npm run build` then `node backend/server.js`, open `http://localhost:3001`, and add `http://localhost:3001/api/auth/google/callback` as a redirect URI in Google Console.

Sessions last 7 days (HTTP-only cookie). Use **Sign out** in the header to log out. If neither `AUTH_PASSWORD` nor Google OAuth is configured, the app has no login.

**Per-user routes:** When auth is enabled, each user only sees and manages their own routes. Google Sign-In users are scoped by email; password users share one account. Existing jobs (from before `user_id` was added) are treated as belonging to the anonymous/default account.

## Build for production

```bash
npm run build
# Serves from backend; frontend static files go to frontend/dist
```

## Publishing for the public

To make the app available on the internet so others can use it:

### 1. Build and run locally (test first)

```bash
npm run build
PORT=3001 node backend/server.js
```

Visit `http://localhost:3001`. The backend serves the built frontend and the API from the same origin (`/api`).

### 2. Choose a host (single-server deployment)

The app runs as one Node process: it serves the API and the static frontend. Use a host that supports Node and **persistent disk** (for the SQLite database).

| Option | Notes |
|--------|--------|
| [Railway](https://railway.app) | Add a volume for `backend/data`, set env vars, deploy from GitHub. |
| [Render](https://render.com) | Web Service, add **persistent disk** for `backend/data` so the DB survives restarts. |
| [Fly.io](https://fly.io) | Use a [volume](https://fly.io/docs/reference/volumes/) for `backend/data` and run `node backend/server.js`. |
| [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform) | Node app; add a volume or use a managed DB later if you outgrow SQLite. Use **repo root** as source; Build Command: `npm run build`; Run Command: `node backend/server.js`. |
| VPS (e.g. DigitalOcean Droplet, Linode) | Full control: install Node, run with `node backend/server.js` or use PM2; put Nginx in front for HTTPS if you want. |

### 3. Set environment variables on the host

Configure these in your host’s dashboard (or `.env` on a VPS):

- **`GOOGLE_MAPS_API_KEY`** — Backend (Directions API). **Required.**
- **`VITE_GOOGLE_MAPS_API_KEY`** — Frontend (Places + Maps). Must be set **at build time** (see below).
- **`PORT`** — Optional; many hosts set this automatically (e.g. `PORT=3001`).
- **`MIN_CYCLE_SECONDS`** — Optional; e.g. `300` to limit API cost.

**Important:** `VITE_*` variables are baked into the frontend at **build time**. So either:

- Build on the host after setting `VITE_GOOGLE_MAPS_API_KEY` in the build environment, or  
- Build locally with the right env, then deploy the built `frontend/dist` and run only the backend on the server.

Example (build with frontend key):

```bash
export VITE_GOOGLE_MAPS_API_KEY=your_key_here
npm run build
# Deploy the whole repo (including frontend/dist) and run: node backend/server.js
```

### 4. Keep the database across deploys

- **DigitalOcean App Platform:** App Platform **does not support volumes**. To keep user data you must add a **database** (Add components → Create or attach database → PostgreSQL). The app does not yet use PostgreSQL; see [docs/DIGITALOCEAN-APP-PLATFORM.md](docs/DIGITALOCEAN-APP-PLATFORM.md) for steps and options.
- **Railway / Render / Fly.io:** Attach a volume and set **`DATA_DIR`** to the mount path (e.g. `DATA_DIR=/data`).
- **VPS:** The app writes to `backend/data/` by default; just don’t delete that folder.

### 5. Restrict and monitor your Google API key

- In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), restrict the key:
  - **Backend key:** Application restriction “None” or “IP addresses” (your server IPs); API restriction “Directions API” (and Geocoding if you use reverse geocode).
  - **Frontend key:** HTTP referrer restriction to your public URL(s), e.g. `https://your-app.up.railway.app/*`; APIs: “Maps JavaScript API”, “Places API”.
- Set **billing alerts** and optional quotas so you don’t get unexpected charges.

### 6. Auth and security

- **With auth:** Set `AUTH_PASSWORD` (and optionally `AUTH_SECRET`) on the host. Only users who sign in with that password can use the app.
- **Without auth:** Leave `AUTH_PASSWORD` unset for open access (fine for personal or trusted use). If you expose the URL broadly, enable auth and consider rate limiting to protect your Google API key.

### Quick checklist

- [ ] `npm run build` and run `node backend/server.js`; test at the host’s URL.
- [ ] Set `GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` (and build with the latter if needed).
- [ ] Attach a persistent volume and set **`DATA_DIR`** to its mount path (e.g. `DATA_DIR=/data`) so users and routes are not lost on redeploy.
- [ ] Restrict Google API keys (referrer for frontend, IP/API for backend) and set billing alerts.
- [ ] (Optional) Set `AUTH_PASSWORD` on the host to require login.

## Project structure

```
├── backend/
│   ├── db/init.js       # SQLite schema + init
│   ├── services/
│   │   ├── googleMaps.js  # Directions API client
│   │   └── scheduler.js   # Collection cycles
│   └── server.js        # Express API + static
├── frontend/
│   └── src/
│       ├── components/   # CreateJob, EditJob, JobDetail, JobsList, etc.
│       └── utils/
└── data/                # SQLite DB (created on first run)
```

## API

| Method | Endpoint                | Description        |
|--------|-------------------------|--------------------|
| GET    | /api/jobs               | List all jobs      |
| POST   | /api/jobs               | Create job         |
| GET    | /api/jobs/:id           | Get job            |
| PATCH  | /api/jobs/:id           | Update job         |
| DELETE | /api/jobs/:id           | Delete job         |
| POST   | /api/jobs/:id/start     | Start collection   |
| POST   | /api/jobs/:id/stop      | Stop collection    |
| POST   | /api/jobs/:id/pause     | Pause collection   |
| POST   | /api/jobs/:id/resume    | Resume collection  |
| GET    | /api/jobs/:id/snapshots | Get route snapshots|
| GET    | /api/jobs/:id/export    | Export CSV/JSON    |
| GET    | /api/route-preview      | Route polyline for map |
