# Architecture

## Overview

Time Session Tracker is a static Vite and TypeScript application. The first version is designed as a local-first browser tool with no server dependency.

## Data Model

The app stores three primary records:

- `Project`: editable project name, color, archive flag, and creation timestamp.
- `WorkSession`: project id, start timestamp, optional end timestamp, and note.
- `Settings`: timer mode and stale-session threshold.

All persisted timestamps are ISO strings in UTC. The interface formats them in the user's browser timezone and UTC.

## Persistence

The app stores state in `localStorage` under `time-session-tracker:v1`.

Running sessions are persisted immediately when started. The app does not need JavaScript to keep executing while the tab is closed; it calculates elapsed time from the stored start timestamp when the app is opened again.

## Timer Modes

Single-active mode is the default. Starting a project ends any currently running sessions at the same timestamp, creating clean non-overlapping work windows.

Parallel mode allows multiple sessions to run at once. This supports cases where the user intentionally needs overlapping project windows.

## Recovery

The app records `lastSeenAt` on normal interactions, visibility changes, and a heartbeat. If a running session exists and the last browser activity is older than the configured threshold, a recovery banner is shown.

The user can:

- keep the timers running,
- end them at the last browser activity,
- end them at the current time.

## Sync Roadmap

Authenticated sync should be treated as a separate product layer. A future sync design should include:

- explicit user sign-in,
- clear privacy policy updates,
- server-side access controls,
- export and delete flows,
- conflict resolution for multiple devices,
- audit handling for modified sessions.
