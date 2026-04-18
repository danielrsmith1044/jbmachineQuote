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

The repo ships with `render.yaml` so the service can be provisioned as a
Blueprint. Current config targets the **free tier** for demo use — see caveats
below before relying on it.

**Free-tier caveats (important)**

The free plan has an ephemeral filesystem — no persistent disk. That means:

- The SQLite DB is recreated on every container restart (each deploy, each
  cold start after 15 min idle). Any quotes, settings edits, or uploaded
  drawings made during a session are wiped.
- On every fresh DB, the app auto-seeds the starter materials catalog (~35
  common stock items) so demos land on a usable app rather than an empty one.
- Free services also spin down after 15 min idle — the first request after
  that takes ~30 seconds to wake up.

Fine for showing somebody the app. Not fine for real use. Upgrade path is
below.

**Prereqs**

- Render account (free tier is enough to demo).
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

**Upgrading to persistent storage**

When you're ready to actually use the app:

1. Edit `render.yaml`:
   - Change `plan: free` → `plan: standard`
   - Add back the `DATA_DIR` env var:
     ```
     - key: DATA_DIR
       value: /data
     ```
   - Append a disk block under the service:
     ```
     disk:
       name: quoter-data
       mountPath: /data
       sizeGB: 1
     ```
2. Commit + push. Render picks up the change and provisions the disk.

Cost after upgrade: ~$7/mo for the Standard web service + ~$0.25/mo for a
1 GB disk. Render doesn't back up disks — for backups, SSH into the service
via the `Shell` tab and `tar czf` the `/data` directory to an external host.

Sizing: 1 GB is enough for tens of thousands of quotes plus a few hundred
MB of drawings. Render can expand a disk without downtime.
