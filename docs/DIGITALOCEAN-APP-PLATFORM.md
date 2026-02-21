# DigitalOcean App Platform: Keeping User Data

## Important: No Volumes on App Platform

**DigitalOcean App Platform does not support persistent volumes.** The filesystem is ephemeral: every redeploy or restart wipes the disk. So the SQLite database (users, routes, snapshots) is lost on each deploy.

To keep user data on App Platform you must use a **database** component, not storage/volumes.

---

## What to Do in the Control Panel

### 1. Add a database to your app

1. Open [DigitalOcean Control Panel](https://cloud.digitalocean.com) → **Apps**.
2. Click your **RouteWatch app**.
3. Click **Add components** (or **Edit** and look for adding a component).
4. Choose **Create or attach database**.
5. Pick one:
   - **Dev Database** – Simple PostgreSQL for development/small use. Same region as the app, free tier available. Good to start.
   - **Attach existing DigitalOcean database** – If you already created a Managed Database (PostgreSQL) under **Databases**, select it here.
6. If you create a **Dev Database**, choose **PostgreSQL** and the size you want.
7. Optionally enable **Add app as a trusted source** so only your app can connect.
8. Confirm / **Add** or **Create**.

### 2. What happens next

- App Platform will add the database as a component and inject a **connection URL** into your app’s environment (often as **`DATABASE_URL`** or a similar variable; the exact name may be shown in the component or in **Settings → Environment Variables**).
- Your app is redeployed so it can use that URL.

### 3. Use the database from the app

The app **supports PostgreSQL**: when **`DATABASE_URL`** is set, it uses the managed database instead of SQLite. App Platform injects this when you attach a database.

- After you add the database component, DigitalOcean sets **`DATABASE_URL`** (or a similar name) on your app. If the variable has another name (e.g. `YOUR_DB_DATABASE_URL`), add an app env var **`DATABASE_URL`** with the same value so the app can connect.
- Redeploy so the app starts with `DATABASE_URL` set. Users and routes will then be stored in PostgreSQL and **will persist** across redeploys.

---

## Using Supabase (or another external PostgreSQL)

You can set **`DATABASE_URL`** to a **Supabase** (or any external) PostgreSQL URI. You do **not** add a database component on DigitalOcean in that case.

**Supabase: use the connection pooler.** From DigitalOcean App Platform, the direct DB (port 5432) is often unreachable (`EHOSTUNREACH`). Use the **pooler** URI instead:

1. In Supabase: **Project Settings** → **Database**.
2. Under **Connection string**, select **URI**.
3. Use the **Session** or **Transaction** pooler connection string — it uses **port 6543** (not 5432). Copy that URI.
4. Replace `[YOUR-PASSWORD]` with your database password.
5. Set **`DATABASE_URL`** on your DigitalOcean app to this URI (and add `?sslmode=require` at the end if the URI doesn’t already include it).
6. Redeploy.

If you use the direct connection (port 5432), the app may fail to start with a connection error; switching to the pooler (6543) fixes it.

---

## Summary

| Goal                         | On App Platform |
|-----------------------------|------------------|
| Keep users & routes        | Add **Create or attach database** (PostgreSQL), then app must use it (code change). |
| Volumes / persistent disk  | **Not available** on App Platform. |
| Use SQLite + volume        | Use another host (e.g. Railway, Render, or a Droplet) where you can mount a volume and set `DATA_DIR`. |
