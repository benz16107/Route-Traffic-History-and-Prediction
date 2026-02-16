# Route Traffic History & Prediction — MVP & Implementation Plan

## Executive Summary

This project **collects, stores, and visualizes** route travel times between two locations over time using the Google Maps Directions API. Users create jobs with start and destination, configure a collection schedule, and view historical trends and per-snapshot route details.

---

## 1. Vision & Goals

### Core Value Proposition

- **Collect** route duration and distance on a configurable schedule
- **Store** full route data: polyline geometry, turn-by-turn steps
- **Visualize** travel time trends and per-collection route maps

### Target Users

- Commuters planning departure times
- Logistics and delivery planners
- Urban mobility researchers
- Developers building traffic-aware apps

---

## 2. Implemented MVP Scope

### Data Collection

| Feature              | Status | Description                                      |
|----------------------|--------|--------------------------------------------------|
| Single route         | Done   | Start + destination (address or coordinates)     |
| Directions API       | Done   | Duration, distance, polyline, steps              |
| Cycle duration       | Done   | Minutes (1–1440) or seconds (10–86400)           |
| Navigation type      | Done   | Driving, walking, transit (set at creation only) |
| Route preferences    | Done   | Avoid highways, avoid tolls (driving only)       |
| Job duration         | Done   | Configurable days (default 7)                    |
| Optional time range  | Done   | Data start/end time (optional)                   |

### Storage

| Feature           | Status | Description                           |
|-------------------|--------|---------------------------------------|
| SQLite            | Done   | `collection_jobs`, `route_snapshots`   |
| Full route data   | Done   | Polyline points, steps, summary       |
| Migrations        | Done   | `cycle_seconds` added via ALTER TABLE |

### Scheduler

| Feature          | Status | Description                              |
|------------------|--------|------------------------------------------|
| Interval-based   | Done   | `setInterval` per job                    |
| Job lifecycle    | Done   | Start, pause, resume, stop               |
| Restore on boot  | Done   | Running jobs resume after server restart |

### Portal (Frontend)

| Feature               | Status | Description                               |
|-----------------------|--------|-------------------------------------------|
| Create job form       | Done   | Autocomplete, schedule, navigation, prefs |
| Edit job              | Done   | Locations, schedule, prefs (no nav type)  |
| Jobs list             | Done   | Short titles (street level), status       |
| Job detail            | Done   | Status, map, stats, chart, snapshots      |
| Route map             | Done   | Leaflet + route preview API               |
| Map updates per cycle | Done   | Refetches when new snapshot arrives       |
| Timeline chart        | Done   | Travel time over time (Recharts)          |
| Per-snapshot expand   | Done   | Map + turn-by-turn for each collection    |
| Countdown             | Done   | Seconds until next cycle                  |
| Export                | Done   | CSV, JSON                                 |
| Current location      | Done   | Geolocation → address for start           |
| Dark UI               | Done   | Plus Jakarta Sans, modern layout          |

---

## 3. Technical Architecture

### System Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  React Frontend  │────▶│  Express API     │────▶│  Scheduler       │
│  (Vite + Leaflet │     │  (REST)          │     │  (setInterval)   │
│   + Recharts)    │     └────────┬─────────┘     └────────┬─────────┘
└──────────────────┘              │                        │
                                  │                        ▼
                                  │               ┌──────────────────┐
                                  │               │  Google Maps     │
                                  │               │  Directions API  │
                                  ▼               └──────────────────┘
                         ┌──────────────────┐
                         │  SQLite          │
                         │  (better-sqlite3)│
                         └──────────────────┘
```

### Technology Stack

| Layer     | Technology                 | Notes                                      |
|-----------|----------------------------|--------------------------------------------|
| Frontend  | React 19, Vite             | SPA with HMR                               |
| UI        | Recharts, Leaflet, CSS     | Charts, maps, no component library         |
| Backend   | Node.js, Express           | REST API                                   |
| Database  | SQLite (better-sqlite3)    | File-based, `data/traffic.db`              |
| Scheduler | In-process setInterval     | Per-job intervals, restored on restart     |
| Maps      | Google Directions API      | Duration, distance, polyline, steps        |
| Places    | Google Places Autocomplete | Address input                              |

---

## 4. Data Model

### `collection_jobs`

| Column           | Type    | Description                               |
|------------------|---------|-------------------------------------------|
| id               | TEXT    | UUID primary key                          |
| start_location   | TEXT    | Address or lat,lng                        |
| end_location     | TEXT    | Address or lat,lng                        |
| start_time       | TEXT    | Optional ISO datetime                     |
| end_time         | TEXT    | Optional ISO datetime                     |
| cycle_minutes    | INTEGER | Default 60; 0 when using cycle_seconds    |
| cycle_seconds    | INTEGER | Default 0; used when > 0                  |
| duration_days    | INTEGER | Default 7                                 |
| navigation_type  | TEXT    | driving, walking, transit                 |
| avoid_highways   | INTEGER | 0/1                                      |
| avoid_tolls      | INTEGER | 0/1                                      |
| status           | TEXT    | pending, running, paused, completed       |
| created_at       | TEXT    | ISO datetime                              |
| updated_at       | TEXT    | ISO datetime                              |

### `route_snapshots`

| Column          | Type | Description                                      |
|-----------------|------|--------------------------------------------------|
| id              | TEXT | UUID primary key                                 |
| job_id          | TEXT | FK to collection_jobs                            |
| route_index     | INT  | 0 = primary route                                |
| collected_at    | TEXT | ISO datetime of collection                       |
| duration_seconds| INT  | Travel time (seconds)                            |
| distance_meters | INT  | Route distance                                   |
| route_details   | TEXT | JSON: points, start, end, steps, summary         |

---

## 5. Google Maps API

### APIs Used

- **Directions API** — Route geometry, duration, distance, steps (driving, walking, transit)
- **Places API** — Autocomplete for address input
- **Maps JavaScript API** — Optional; frontend uses Leaflet + Directions for preview

### Request Behavior

- **Driving:** `departure_time=now`, `traffic_model=best_guess` → uses `duration_in_traffic`
- **Walking / Transit:** `avoid` (highways, tolls) not sent; transit uses `departure_time=now`

---

## 6. Out of Scope (Current MVP)

- Predictions (ML, time-series models)
- Multiple alternative routes per collection
- Traffic zones or heatmaps
- Alerts or notifications
- User accounts or auth
- PostgreSQL / cloud deployment

---

## 7. Possible Extensions

### Predictive Features

- Expected travel time at future datetime from historical patterns
- Best departure window suggestions
- Anomaly detection (unusually slow days)

### Data & Analytics

- Aggregations by hour, day of week, month
- Percentiles (P50, P90, P95)
- Weather or holiday correlation (if data available)

### Operational

- Health checks for API, DB, scheduler
- Retry with backoff for transient API failures
- Data retention / archival policy

---

## 8. Success Metrics

| Metric                  | Target              |
|-------------------------|---------------------|
| Collection reliability  | >99% of cycles run  |
| Portal load             | <3 seconds          |
| API cost (1 route, 1 hr)| <$5/month           |
| Create → first results  | <10 minutes         |

---

*Document version: 2.0*  
*Last updated: February 2025*
