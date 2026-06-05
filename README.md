# Retirement Planner (local-only)

A self-contained retirement planning app. Everything runs on `127.0.0.1` — no data ever leaves your PC.

## Stack
- **Frontend:** React (Vite) + Recharts
- **Backend:** Node.js + Express (reads/writes `data.json` in the project root)
- **Process:** `concurrently` runs both with a single `npm start`

## Setup (one time)
```
npm run install:all
```
This installs the root, `server/`, and `client/` dependencies.

## Run
```
npm start
```
The Express server starts on `127.0.0.1:3001`, the Vite dev server on `127.0.0.1:5173`, and the browser opens automatically.

## Where your data lives
After your first **Save & Calculate**, a `data.json` file appears in the project root. It's pre-loaded into the form on every subsequent launch. To wipe everything, delete that file.

## Privacy
- Express binds only to `127.0.0.1` (loopback). It is not reachable from your LAN.
- No analytics, no telemetry, no external requests from either the client or the server.

## Project layout
```
/                   root: orchestrator package.json
/server             Express app (port 3001)
/client             React + Vite app (port 5173)
/data.json          (created after first save)
```
