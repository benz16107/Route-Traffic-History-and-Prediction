# Route Traffic History & Prediction

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
- **Frontend:** http://localhost:5173 (proxies `/api` to backend)

## Build for production

```bash
npm run build
# Serves from backend; frontend static files go to frontend/dist
```

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
