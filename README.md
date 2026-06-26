# Time Session Tracker

A local-first web app for tracking project work sessions and copying start/end times in both local time and UTC.

## Product Decision

This app is intentionally static and browser-local for the first version. It does not need a backend, login, OAuth, database, or Vercel server functions to meet the core workflow.

Recommended hosting for the current version: **GitHub Pages**.

Use Vercel later if the app adds authenticated sync, server-side storage, team sharing, protected preview deployments, or OAuth callbacks. Those features would change the privacy model and require a proper backend design.

## Features

- Create and rename projects.
- Start and end project sessions.
- Pause and resume project work with clean session windows.
- Backdate a running session when the user forgot to pause on time.
- Single-active mode: starting one project automatically ends the current running session.
- Parallel mode: multiple project sessions can run at the same time.
- Local and UTC timestamps for each work window.
- Editable session start/end times and notes.
- Copy visible sessions as local-time or UTC tab-separated text for project tools and spreadsheets.
- Export/import JSON backups.
- Browser-close recovery for timers left running.

## Browser Storage

Session data is saved to `localStorage` in the browser. Running timers are stored as timestamps, so a timer can be reconstructed after reopening the app. If the tab was closed or inactive for a long gap, the app asks whether to keep the timer running, end it at the last browser activity, or end it now.

Private/incognito windows and browser data clearing can remove local data. Export JSON backups when records matter.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production build is generated in `dist/`.

## Deployment

GitHub Pages can host the static `dist/` output. The included workflow builds and publishes the app from `main`.

Vercel can also deploy the project as a Vite static app. No server functions are required.
