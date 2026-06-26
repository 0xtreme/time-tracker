import "./styles.css";

type TimerMode = "exclusive" | "parallel";

type Project = {
  id: string;
  name: string;
  createdAt: string;
  color: string;
  archived: boolean;
};

type WorkSession = {
  id: string;
  projectId: string;
  startAt: string;
  endAt: string | null;
  note: string;
};

type Settings = {
  timerMode: TimerMode;
  staleAfterMinutes: number;
};

type AppState = {
  schemaVersion: 1;
  projects: Project[];
  sessions: WorkSession[];
  settings: Settings;
  lastSeenAt: string;
};

const STORAGE_KEY = "time-session-tracker:v1";
const HEARTBEAT_MS = 30_000;
const PROJECT_COLORS = ["#2563eb", "#0f766e", "#9333ea", "#c2410c", "#be123c", "#4d7c0f"];

const appElement = document.querySelector<HTMLDivElement>("#app");

if (!appElement) {
  throw new Error("App root was not found.");
}

const app: HTMLDivElement = appElement;

let state = loadState();
let selectedProjectId = "all";
let recoveryVisible = shouldShowRecovery(state);
let notice = "";

render();

setInterval(() => {
  touchLastSeen();
  renderTimerValues();
}, HEARTBEAT_MS);

setInterval(renderTimerValues, 1000);

window.addEventListener("beforeunload", touchLastSeen);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    touchLastSeen();
  }
});

function loadState(): AppState {
  const fallback = createInitialState();
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.sessions)) {
      return fallback;
    }

    return {
      schemaVersion: 1,
      projects: parsed.projects.length ? parsed.projects : fallback.projects,
      sessions: parsed.sessions,
      settings: {
        timerMode: parsed.settings?.timerMode === "parallel" ? "parallel" : "exclusive",
        staleAfterMinutes: Number(parsed.settings?.staleAfterMinutes) || 15,
      },
      lastSeenAt: parsed.lastSeenAt || nowIso(),
    };
  } catch {
    return fallback;
  }
}

function createInitialState(): AppState {
  const createdAt = nowIso();

  return {
    schemaVersion: 1,
    projects: [
      { id: makeId("project"), name: "Project 1", createdAt, color: PROJECT_COLORS[0], archived: false },
      { id: makeId("project"), name: "Project 2", createdAt, color: PROJECT_COLORS[1], archived: false },
      { id: makeId("project"), name: "Project 3", createdAt, color: PROJECT_COLORS[2], archived: false },
    ],
    sessions: [],
    settings: {
      timerMode: "exclusive",
      staleAfterMinutes: 15,
    },
    lastSeenAt: createdAt,
  };
}

function saveState(options: { heartbeat?: boolean } = {}) {
  const nextState = {
    ...state,
    lastSeenAt: options.heartbeat === false ? state.lastSeenAt : nowIso(),
  };

  state = nextState;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function touchLastSeen() {
  saveState();
}

function render() {
  const activeSessions = getActiveSessions();
  const totalToday = state.sessions
    .filter((session) => isSameLocalDay(session.startAt, nowIso()))
    .reduce((sum, session) => sum + sessionDurationMs(session), 0);

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Local-first work log</p>
          <h1>Time Session Tracker</h1>
        </div>
        <div class="topbar__stats" aria-label="Current tracker summary">
          <span>${activeSessions.length} running</span>
          <span>${formatDuration(totalToday)} today</span>
        </div>
      </header>

      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
      ${renderRecoveryBanner()}

      <section class="workspace">
        <aside class="project-panel" aria-label="Projects">
          <div class="panel-heading">
            <div>
              <h2>Projects</h2>
              <p>${state.settings.timerMode === "exclusive" ? "Starting one project ends the previous running session." : "Projects can run at the same time."}</p>
            </div>
            <button class="icon-button" data-action="add-project" title="Add project" aria-label="Add project">+</button>
          </div>
          <div class="mode-toggle" role="group" aria-label="Timer mode">
            <button class="${state.settings.timerMode === "exclusive" ? "is-active" : ""}" data-action="set-mode" data-mode="exclusive">Single active</button>
            <button class="${state.settings.timerMode === "parallel" ? "is-active" : ""}" data-action="set-mode" data-mode="parallel">Parallel</button>
          </div>
          <div class="project-list">
            ${state.projects.filter((project) => !project.archived).map(renderProjectCard).join("")}
          </div>
        </aside>

        <section class="session-panel" aria-label="Session log">
          <div class="session-toolbar">
            <div>
              <h2>Sessions</h2>
              <p>Local timezone: ${escapeHtml(getLocalTimeZone())}. UTC is shown for every completed window.</p>
            </div>
            <div class="toolbar-actions">
              <button data-action="end-all" ${activeSessions.length ? "" : "disabled"}>End all</button>
              <button data-action="copy-tsv" ${state.sessions.length ? "" : "disabled"}>Copy TSV</button>
              <button data-action="export-json">Export</button>
              <label class="file-button">
                Import
                <input type="file" data-action="import-json" accept="application/json" />
              </label>
            </div>
          </div>

          <div class="filters" role="group" aria-label="Filter sessions">
            <button class="${selectedProjectId === "all" ? "is-active" : ""}" data-action="select-project" data-project-id="all">All</button>
            ${state.projects.map((project) => `
              <button class="${selectedProjectId === project.id ? "is-active" : ""}" data-action="select-project" data-project-id="${project.id}">
                ${escapeHtml(project.name)}
              </button>
            `).join("")}
          </div>

          <div class="sessions">
            ${renderSessions()}
          </div>
        </section>
      </section>

      <section class="support">
        <details>
          <summary>Privacy, terms, and browser behavior</summary>
          <div class="support-grid">
            <article>
              <h3>Storage</h3>
              <p>Data is stored in this browser using localStorage. There is no server account, database, or third-party sync in this version.</p>
            </article>
            <article>
              <h3>Closed windows</h3>
              <p>Running sessions are saved as timestamps. If the tab closes, elapsed time is reconstructed when the app reopens. A long gap prompts a recovery choice.</p>
            </article>
            <article>
              <h3>Terms</h3>
              <p>This tool is provided as-is for manual time records. Review copied times before submitting them to payroll, client, or project systems.</p>
            </article>
          </div>
        </details>
      </section>
    </main>
  `;

  bindEvents();
  renderTimerValues();
}

function renderProjectCard(project: Project) {
  const active = state.sessions.find((session) => session.projectId === project.id && !session.endAt);
  const completedMs = state.sessions
    .filter((session) => session.projectId === project.id)
    .reduce((sum, session) => sum + sessionDurationMs(session), 0);

  return `
    <article class="project-card ${active ? "is-running" : ""}" style="--accent:${project.color}">
      <div class="project-card__top">
        <span class="project-dot" aria-hidden="true"></span>
        <input class="project-name" data-action="rename-project" data-project-id="${project.id}" value="${escapeAttribute(project.name)}" aria-label="Project name" />
      </div>
      <div class="project-meta">
        <span data-timer-for="${project.id}">${active ? formatDuration(Date.now() - new Date(active.startAt).getTime()) : formatDuration(completedMs)}</span>
        <span>${active ? "running" : `${countProjectSessions(project.id)} sessions`}</span>
      </div>
      <div class="project-actions">
        <button class="primary" data-action="${active ? "stop-project" : "start-project"}" data-project-id="${project.id}">
          ${active ? "End session" : "Start"}
        </button>
        <button data-action="quick-note" data-project-id="${project.id}" ${active ? "" : "disabled"}>Note</button>
        <button class="ghost" data-action="archive-project" data-project-id="${project.id}" ${active ? "disabled" : ""}>Archive</button>
      </div>
    </article>
  `;
}

function renderRecoveryBanner() {
  if (!recoveryVisible) {
    return "";
  }

  const lastSeen = new Date(state.lastSeenAt);
  const gap = Date.now() - lastSeen.getTime();
  const activeCount = getActiveSessions().length;

  if (!activeCount) {
    return "";
  }

  return `
    <section class="recovery" aria-label="Timer recovery">
      <div>
        <strong>${activeCount} session${activeCount === 1 ? "" : "s"} were running while this tab was away.</strong>
        <p>Last browser activity was ${formatLocalDateTime(lastSeen.toISOString())}, about ${formatDuration(gap)} ago.</p>
      </div>
      <div class="recovery-actions">
        <button data-action="keep-running">Keep running</button>
        <button data-action="stop-at-last-seen">End at last activity</button>
        <button class="primary" data-action="stop-at-now">End now</button>
      </div>
    </section>
  `;
}

function renderSessions() {
  const sessions = filteredSessions();

  if (!sessions.length) {
    return `
      <div class="empty-state">
        <h3>No sessions yet</h3>
        <p>Start a project to create the first copyable work window.</p>
      </div>
    `;
  }

  return `
    <div class="session-table" role="table" aria-label="Work sessions">
      <div class="session-row session-row--head" role="row">
        <span>Project</span>
        <span>Local start</span>
        <span>Local end</span>
        <span>UTC start</span>
        <span>UTC end</span>
        <span>Duration</span>
        <span>Note</span>
        <span></span>
      </div>
      ${sessions.map(renderSessionRow).join("")}
    </div>
  `;
}

function renderSessionRow(session: WorkSession) {
  const project = getProject(session.projectId);
  const endValue = session.endAt ? toLocalInputValue(session.endAt) : "";
  const duration = sessionDurationMs(session);

  return `
    <div class="session-row" role="row">
      <span class="project-pill" style="--accent:${project?.color || "#475569"}">${escapeHtml(project?.name || "Deleted project")}</span>
      <label>
        <span class="sr-only">Local start</span>
        <input type="datetime-local" data-action="edit-session-start" data-session-id="${session.id}" value="${toLocalInputValue(session.startAt)}" />
      </label>
      <label>
        <span class="sr-only">Local end</span>
        <input type="datetime-local" data-action="edit-session-end" data-session-id="${session.id}" value="${endValue}" />
      </label>
      <span>${formatUtcDateTime(session.startAt)}</span>
      <span>${session.endAt ? formatUtcDateTime(session.endAt) : "Running"}</span>
      <strong data-session-duration="${session.id}">${formatDuration(duration)}</strong>
      <input class="note-input" data-action="edit-note" data-session-id="${session.id}" value="${escapeAttribute(session.note)}" placeholder="Optional note" />
      <div class="row-actions">
        ${session.endAt ? "" : `<button data-action="stop-session" data-session-id="${session.id}">End</button>`}
        <button class="ghost" data-action="delete-session" data-session-id="${session.id}">Delete</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    const action = element.dataset.action;

    if (action === "rename-project" || action === "edit-note") {
      element.addEventListener("input", handleInput);
      return;
    }

    if (action === "edit-session-start" || action === "edit-session-end") {
      element.addEventListener("change", handleInput);
      return;
    }

    if (action === "import-json") {
      element.addEventListener("change", importJson);
      return;
    }

    element.addEventListener("click", handleClick);
  });
}

function handleClick(event: Event) {
  const target = event.currentTarget as HTMLElement;
  const action = target.dataset.action;
  const projectId = target.dataset.projectId;
  const sessionId = target.dataset.sessionId;

  switch (action) {
    case "add-project":
      addProject();
      break;
    case "archive-project":
      if (projectId) archiveProject(projectId);
      break;
    case "start-project":
      if (projectId) startProject(projectId);
      break;
    case "stop-project":
      if (projectId) stopProject(projectId);
      break;
    case "quick-note":
      if (projectId) addQuickNote(projectId);
      break;
    case "set-mode":
      setMode(target.dataset.mode === "parallel" ? "parallel" : "exclusive");
      break;
    case "select-project":
      selectedProjectId = projectId || "all";
      render();
      break;
    case "end-all":
      endAll(nowIso());
      break;
    case "copy-tsv":
      void copyTsv();
      break;
    case "export-json":
      exportJson();
      break;
    case "stop-session":
      if (sessionId) stopSession(sessionId, nowIso());
      break;
    case "delete-session":
      if (sessionId) deleteSession(sessionId);
      break;
    case "keep-running":
      recoveryVisible = false;
      touchLastSeen();
      render();
      break;
    case "stop-at-last-seen":
      endAll(state.lastSeenAt);
      recoveryVisible = false;
      break;
    case "stop-at-now":
      endAll(nowIso());
      recoveryVisible = false;
      break;
  }
}

function handleInput(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const action = target.dataset.action;
  const projectId = target.dataset.projectId;
  const sessionId = target.dataset.sessionId;

  if (action === "rename-project" && projectId) {
    const project = getProject(projectId);
    if (project) {
      project.name = target.value.trim() || "Untitled project";
      saveState();
    }
    return;
  }

  const session = sessionId ? getSession(sessionId) : undefined;

  if (!session) {
    return;
  }

  if (action === "edit-note") {
    session.note = target.value;
    saveState();
  }

  if (action === "edit-session-start") {
    const parsed = fromLocalInputValue(target.value);
    if (parsed) {
      session.startAt = parsed;
      if (session.endAt && new Date(session.endAt).getTime() < new Date(parsed).getTime()) {
        session.endAt = parsed;
      }
      saveState();
      render();
    }
  }

  if (action === "edit-session-end") {
    session.endAt = target.value ? fromLocalInputValue(target.value) : null;
    saveState();
    render();
  }
}

function addProject() {
  const projectNumber = state.projects.length + 1;
  state.projects.push({
    id: makeId("project"),
    name: `Project ${projectNumber}`,
    createdAt: nowIso(),
    color: PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length],
    archived: false,
  });
  saveState();
  render();
}

function archiveProject(projectId: string) {
  const project = getProject(projectId);
  if (!project) return;

  project.archived = true;
  if (selectedProjectId === projectId) {
    selectedProjectId = "all";
  }
  saveState();
  render();
}

function startProject(projectId: string) {
  const timestamp = nowIso();

  if (state.settings.timerMode === "exclusive") {
    state.sessions.forEach((session) => {
      if (!session.endAt) {
        session.endAt = timestamp;
      }
    });
  }

  state.sessions.unshift({
    id: makeId("session"),
    projectId,
    startAt: timestamp,
    endAt: null,
    note: "",
  });
  recoveryVisible = false;
  saveState();
  render();
}

function stopProject(projectId: string) {
  const active = state.sessions.find((session) => session.projectId === projectId && !session.endAt);
  if (active) {
    stopSession(active.id, nowIso());
  }
}

function stopSession(sessionId: string, endAt: string) {
  const session = getSession(sessionId);
  if (!session) return;

  session.endAt = endAt;
  saveState();
  render();
}

function endAll(endAt: string) {
  state.sessions.forEach((session) => {
    if (!session.endAt) {
      session.endAt = endAt;
    }
  });
  saveState();
  render();
}

function deleteSession(sessionId: string) {
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  saveState();
  render();
}

function addQuickNote(projectId: string) {
  const active = state.sessions.find((session) => session.projectId === projectId && !session.endAt);
  if (!active) return;

  const note = window.prompt("Session note", active.note);
  if (note !== null) {
    active.note = note;
    saveState();
    render();
  }
}

function setMode(mode: TimerMode) {
  state.settings.timerMode = mode;
  if (mode === "exclusive") {
    const active = getActiveSessions();
    active.slice(1).forEach((session) => {
      session.endAt = nowIso();
    });
  }
  saveState();
  render();
}

async function copyTsv() {
  const rows = [
    ["Project", "Local Start", "Local End", "UTC Start", "UTC End", "Duration", "Note"],
    ...filteredSessions().map((session) => {
      const project = getProject(session.projectId);
      return [
        project?.name || "Deleted project",
        formatLocalDateTime(session.startAt),
        session.endAt ? formatLocalDateTime(session.endAt) : "Running",
        formatUtcDateTime(session.startAt),
        session.endAt ? formatUtcDateTime(session.endAt) : "Running",
        formatDuration(sessionDurationMs(session)),
        session.note,
      ];
    }),
  ];

  const tsv = rows.map((row) => row.map((cell) => cell.replace(/\t|\n/g, " ")).join("\t")).join("\n");
  await navigator.clipboard.writeText(tsv);
  notice = "Copied the visible session table as tab-separated text.";
  render();
}

function exportJson() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `time-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importJson(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(String(reader.result)) as AppState;
      if (!Array.isArray(imported.projects) || !Array.isArray(imported.sessions)) {
        throw new Error("Invalid import shape.");
      }
      state = {
        schemaVersion: 1,
        projects: imported.projects,
        sessions: imported.sessions,
        settings: {
          timerMode: imported.settings?.timerMode === "parallel" ? "parallel" : "exclusive",
          staleAfterMinutes: Number(imported.settings?.staleAfterMinutes) || 15,
        },
        lastSeenAt: nowIso(),
      };
      selectedProjectId = "all";
      recoveryVisible = shouldShowRecovery(state);
      saveState();
      notice = "Imported sessions from JSON.";
      render();
    } catch {
      notice = "Import failed. Choose a JSON export from this tracker.";
      render();
    }
  });
  reader.readAsText(file);
}

function filteredSessions() {
  const sessions = selectedProjectId === "all"
    ? state.sessions
    : state.sessions.filter((session) => session.projectId === selectedProjectId);

  return [...sessions].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
}

function getProject(projectId: string) {
  return state.projects.find((project) => project.id === projectId);
}

function getSession(sessionId: string) {
  return state.sessions.find((session) => session.id === sessionId);
}

function getActiveSessions() {
  return state.sessions.filter((session) => !session.endAt);
}

function countProjectSessions(projectId: string) {
  return state.sessions.filter((session) => session.projectId === projectId).length;
}

function sessionDurationMs(session: WorkSession) {
  const start = new Date(session.startAt).getTime();
  const end = session.endAt ? new Date(session.endAt).getTime() : Date.now();
  return Math.max(0, end - start);
}

function renderTimerValues() {
  state.projects.forEach((project) => {
    const active = state.sessions.find((session) => session.projectId === project.id && !session.endAt);
    const timer = app.querySelector<HTMLElement>(`[data-timer-for="${project.id}"]`);
    if (timer && active) {
      timer.textContent = formatDuration(Date.now() - new Date(active.startAt).getTime());
    }
  });

  state.sessions.forEach((session) => {
    if (!session.endAt) {
      const duration = app.querySelector<HTMLElement>(`[data-session-duration="${session.id}"]`);
      if (duration) {
        duration.textContent = formatDuration(sessionDurationMs(session));
      }
    }
  });
}

function shouldShowRecovery(nextState: AppState) {
  const lastSeen = new Date(nextState.lastSeenAt).getTime();
  const staleMs = nextState.settings.staleAfterMinutes * 60_000;
  return nextState.sessions.some((session) => !session.endAt) && Date.now() - lastSeen > staleMs;
}

function isSameLocalDay(leftIso: string, rightIso: string) {
  const left = new Date(leftIso);
  const right = new Date(rightIso);
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local browser time";
}

function formatLocalDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatUtcDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso)).replace(",", "") + " UTC";
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
