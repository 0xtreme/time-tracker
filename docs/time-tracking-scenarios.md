# Time Tracking Scenario Matrix

This document defines the expected behavior for project timers, session rows, pause/resume, switching projects, and backdated corrections.

## Core Model

- A `WorkSession` is one work window with `startAt`, optional `endAt`, project id, and note.
- A project's displayed timer is cumulative: all completed sessions plus the currently running session.
- A session row's displayed timer is only that row's duration.
- Pause closes the current running session.
- Resume creates a new running session for the same project.
- In single-active mode, starting or resuming a project closes any other running session at the same timestamp.
- In parallel mode, projects can have running sessions at the same time.

## Backdate Model

Backdate means: "the project should have stopped counting this many minutes ago."

If the requested backdate fits inside the current running session:

- end the current session at `now - requestedMinutes`,
- leave older sessions unchanged.

If the requested backdate is longer than the current running session:

- close the current session at its start time,
- remove the remaining correction time from previous completed sessions for the same project,
- trim previous sessions newest-first by moving their end times earlier,
- never move a session end before its start,
- if there is not enough previous time, remove as much as possible and tell the user.

Backdate should never fail just because the current resumed segment is shorter than the requested correction.

## Required Scenarios

| ID | Scenario | Expected Result |
| --- | --- | --- |
| S01 | Start Project 1 | Project 1 has one running session; project timer increases. |
| S02 | Pause Project 1 | Running session gets an end time; project total remains visible; button changes to Resume. |
| S03 | Resume Project 1 | New running session is created; project total continues from previous time instead of resetting to zero. |
| S04 | Start Project 2 while Project 1 is running in single-active mode | Project 1 running session is ended; Project 2 starts; only one session is running. |
| S05 | Resume Project 1 while Project 2 is running in single-active mode | Project 2 running session is ended; Project 1 starts a new session; both project totals are preserved. |
| S06 | Backdate Project 1 by less than the current run duration | Current session ends at `now - requested`; older Project 1 sessions are unchanged. |
| S07 | Backdate Project 1 by more than the current run duration after resume | Current session is zeroed at its start; newest previous Project 1 sessions are trimmed until requested time is removed. |
| S08 | Backdate Project 1 by more time than Project 1 has logged | All available Project 1 time is trimmed to zero-duration sessions; user is told the full correction could not be applied. |
| S09 | Backdate Project 1 does not affect Project 2 sessions | Only sessions for Project 1 are changed. |
| S10 | Edit a completed session start/end | Project total updates from the edited row. |
| S11 | Copy local with a project filter selected | Clipboard includes only visible filtered sessions, using local timestamps. |
| S12 | Copy UTC with all projects selected | Clipboard includes all visible sessions, using UTC timestamps. |
| S13 | Save file | Browser downloads JSON containing projects, sessions, settings, and last seen time. |
| S14 | Upload file | Imported JSON replaces local state and re-renders projects/sessions. |
| S15 | Reopen with a stale running session | Recovery banner appears; user can keep running, end at last seen, or end now. |

## Non-Goals

- The app does not create accounts or sync data to a backend.
- The app does not automatically write a backup file when the window closes because browsers require user interaction for file writes.
- The app does not silently delete corrected sessions; zero-duration rows remain visible and editable.
