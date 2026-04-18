# JB Machine Quoting

Local-only quoting app for a small machine shop. Node/Express + SQLite + React.

## Install

```
npm install
npm run install:all
```

## Run (dev)

```
npm run dev
```

- API: http://localhost:4000
- UI:  http://localhost:5173

## Run (production mode, single port)

```
npm run build:client
npm start
```

The server serves the built client on http://localhost:4000.

## Data

SQLite file is created at `server/data/quoter.db` on first run and seeded with
default shop settings. Uploaded drawings live in `server/data/attachments/`.
To point at a different directory (e.g. a mounted volume), set `DATA_DIR` in
the environment; the server will create the tree on startup.

## Deploy to Render

The repo ships with `render.yaml` so the service and persistent disk can be
provisioned as a Blueprint.

**Prereqs**

- Render account with a paid plan (**Standard or higher** — the free tier
  cannot mount a persistent disk, so the database and uploaded drawings would
  vanish on every deploy).
- Repo pushed to GitHub/GitLab and connected to Render.

**Deploy**

1. In the Render dashboard → *New* → *Blueprint* → pick this repo.
2. Render reads `render.yaml` and proposes one web service + a 1 GB disk
   mounted at `/data`. Approve.
3. First build takes a few minutes (Render runs `npm run build`, which
   installs server + client deps and builds the React bundle; then `npm start`
   boots `server/index.js` on the port Render assigns).
4. Visit the URL Render gives you (`https://jbmachine-quoter.onrender.com` or
   similar) — at this point the app is **open to the public**. Lock it down
   next.

**Lock it down (strongly recommended)**

This app has no user accounts. To prevent anyone who stumbles on the URL
from reading or modifying your quotes, set two env vars in the Render
dashboard:

- `AUTH_USER` — pick a username
- `AUTH_PASS` — pick a strong password (don't reuse one from anywhere else)

Save; Render redeploys automatically. The app now requires HTTP Basic Auth on
every request other than the health check. Leave either var blank to return
to open mode (useful only for a staging URL behind a firewall).

**Persistence and backups**

- SQLite DB → `/data/quoter.db`
- Uploaded drawings → `/data/attachments/<quote_id>/...`

Render doesn't back up disks. To back up, connect to the service's shell
(`Shell` tab in the dashboard) and run:

```
cd /data && tar czf /tmp/backup.tgz quoter.db attachments/
```

Then download `/tmp/backup.tgz` via `curl` to an external host or use
`rsync` to a machine you control. Schedule this with a cron job on your side
if backups matter.

**Sizing**

1 GB is enough for tens of thousands of quotes plus a few hundred MB of
drawings. Grow the disk from the Render dashboard when needed (Render can
expand a disk without downtime, but cannot shrink it).

**Cost (as of writing, verify in Render dashboard)**

- Standard web service: ~$7/mo
- 1 GB persistent disk: ~$0.25/mo
