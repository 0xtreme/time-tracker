import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";

const storageKey = "time-session-tracker:v1";
const projectOneId = "project_1";
const projectTwoId = "project_2";
const projectThreeId = "project_3";
const nonZeroDuration = /(?:[1-9]\d*h|[1-9]\d*m|[1-9]\d*s)/;

type SeedSession = {
  id: string;
  projectId: string;
  startAgoMs: number;
  endAgoMs: number | null;
  note?: string;
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
  await page.reload();
});

function projectCard(page: Page, name: string) {
  return page.locator(".project-card").filter({ has: page.locator(`input[value="${name}"]`) });
}

function projectDuration(card: Locator) {
  return card.locator(".project-meta span").first();
}

async function seedState(page: Page, sessions: SeedSession[], timerMode: "exclusive" | "parallel" = "exclusive") {
  const now = Date.now();
  const state = {
    schemaVersion: 1,
    projects: [
      { id: projectOneId, name: "Project 1", createdAt: new Date(now).toISOString(), color: "#2563eb", archived: false },
      { id: projectTwoId, name: "Project 2", createdAt: new Date(now).toISOString(), color: "#0f766e", archived: false },
      { id: projectThreeId, name: "Project 3", createdAt: new Date(now).toISOString(), color: "#9333ea", archived: false },
    ],
    sessions: sessions.map((session) => ({
      id: session.id,
      projectId: session.projectId,
      startAt: new Date(now - session.startAgoMs).toISOString(),
      endAt: session.endAgoMs === null ? null : new Date(now - session.endAgoMs).toISOString(),
      note: session.note || "",
    })),
    settings: {
      timerMode,
      staleAfterMinutes: 15,
      theme: "light",
    },
    lastSeenAt: new Date(now).toISOString(),
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: "seed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.getByText("Imported sessions from JSON.")).toBeVisible();
}

async function stateProjectDurationMs(page: Page, projectId: string) {
  return page.evaluate(
    ({ key, id }) => {
      const state = JSON.parse(window.localStorage.getItem(key) || "{}");
      return state.sessions
        .filter((session: { projectId: string }) => session.projectId === id)
        .reduce((sum: number, session: { startAt: string; endAt: string | null }) => {
          const start = new Date(session.startAt).getTime();
          const end = session.endAt ? new Date(session.endAt).getTime() : Date.now();
          return sum + Math.max(0, end - start);
        }, 0);
    },
    { key: storageKey, id: projectId },
  );
}

async function runningSessionCount(page: Page) {
  return page.evaluate((key) => {
    const state = JSON.parse(window.localStorage.getItem(key) || "{}");
    return state.sessions.filter((session: { endAt: string | null }) => !session.endAt).length;
  }, storageKey);
}

async function localInputValueForAgo(page: Page, agoMs: number) {
  return page.evaluate((ms) => {
    const date = new Date(Date.now() - ms);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }, agoMs);
}

async function backdateProject(card: Locator, minutes: string) {
  const page = card.page();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("End this running session");
    await dialog.accept(minutes);
  });
  await card.getByRole("button", { name: "Backdate" }).click();
}

function expectDurationNear(actualMs: number, expectedMs: number, toleranceMs = 2500) {
  expect(Math.abs(actualMs - expectedMs)).toBeLessThanOrEqual(toleranceMs);
}

test("S01-S03: pause and resume keep cumulative project time", async ({ page }) => {
  const projectOne = projectCard(page, "Project 1");

  await projectOne.getByRole("button", { name: "Start" }).click();
  await expect(projectOne.getByText("running")).toBeVisible();
  await page.waitForTimeout(1100);

  await projectOne.getByRole("button", { name: "Pause" }).click();
  await expect(projectOne.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);

  await projectOne.getByRole("button", { name: "Resume" }).click();
  await expect(projectOne.getByText(/running 0m/)).toBeVisible();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
});

test("S04-S05: single-active switching preserves both project totals", async ({ page }) => {
  const projectOne = projectCard(page, "Project 1");
  const projectTwo = projectCard(page, "Project 2");

  await projectOne.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1100);
  await projectTwo.getByRole("button", { name: "Start" }).click();

  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
  await expect(projectTwo.getByText(/running 0m/)).toBeVisible();
  expect(await runningSessionCount(page)).toBe(1);

  await page.waitForTimeout(1100);
  await projectOne.getByRole("button", { name: "Resume" }).click();

  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
  await expect(projectDuration(projectTwo)).toHaveText(nonZeroDuration);
  expect(await runningSessionCount(page)).toBe(1);
});

test("S06: backdate inside the current running session ends it in the past", async ({ page }) => {
  await seedState(page, [
    { id: "p1-active", projectId: projectOneId, startAgoMs: 10 * 60_000, endAgoMs: null },
  ]);
  const projectOne = projectCard(page, "Project 1");

  await backdateProject(projectOne, "5");

  await expect(projectOne.getByRole("button", { name: "Resume" })).toBeVisible();
  expect(await runningSessionCount(page)).toBe(0);
  expectDurationNear(await stateProjectDurationMs(page, projectOneId), 5 * 60_000, 65_000);
});

test("S07: backdate beyond current resumed segment trims previous project sessions newest-first", async ({ page }) => {
  await seedState(page, [
    { id: "p1-old", projectId: projectOneId, startAgoMs: 15 * 60_000, endAgoMs: 6 * 60_000 },
    { id: "p1-active", projectId: projectOneId, startAgoMs: 60_000, endAgoMs: null },
  ]);
  const projectOne = projectCard(page, "Project 1");

  await backdateProject(projectOne, "5");

  await expect(projectOne.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByText("Backdated 5m 00s from this project's logged time.")).toBeVisible();
  expect(await runningSessionCount(page)).toBe(0);
  expectDurationNear(await stateProjectDurationMs(page, projectOneId), 5 * 60_000, 65_000);
});

test("S08: backdate more than the project has logged trims all available project time", async ({ page }) => {
  await seedState(page, [
    { id: "p1-old", projectId: projectOneId, startAgoMs: 90_000, endAgoMs: 30_000 },
    { id: "p1-active", projectId: projectOneId, startAgoMs: 10_000, endAgoMs: null },
  ]);
  const projectOne = projectCard(page, "Project 1");

  await backdateProject(projectOne, "5");

  await expect(page.getByText(/There was not enough previous time/)).toBeVisible();
  expect(await runningSessionCount(page)).toBe(0);
  expectDurationNear(await stateProjectDurationMs(page, projectOneId), 0);
});

test("S09: backdating one project does not change another project's sessions", async ({ page }) => {
  await seedState(page, [
    { id: "p1-old", projectId: projectOneId, startAgoMs: 15 * 60_000, endAgoMs: 6 * 60_000 },
    { id: "p1-active", projectId: projectOneId, startAgoMs: 60_000, endAgoMs: null },
    { id: "p2-old", projectId: projectTwoId, startAgoMs: 12 * 60_000, endAgoMs: 5 * 60_000 },
  ]);
  const projectOne = projectCard(page, "Project 1");

  const projectTwoBefore = await stateProjectDurationMs(page, projectTwoId);
  await backdateProject(projectOne, "5");

  expectDurationNear(await stateProjectDurationMs(page, projectOneId), 5 * 60_000);
  expectDurationNear(await stateProjectDurationMs(page, projectTwoId), projectTwoBefore);
});

test("S10: editing a completed session changes the project total", async ({ page }) => {
  await seedState(page, [
    { id: "p1-complete", projectId: projectOneId, startAgoMs: 10 * 60_000, endAgoMs: 0 },
  ]);

  const fiveMinutesAgo = await localInputValueForAgo(page, 5 * 60_000);
  const endInput = page.locator('[data-action="edit-session-end"]').first();
  await endInput.fill(fiveMinutesAgo);
  await endInput.dispatchEvent("change");

  expectDurationNear(await stateProjectDurationMs(page, projectOneId), 5 * 60_000, 65_000);
});

test("S11-S12: copy actions respect project filter and timezone mode", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedState(page, [
    { id: "p1-complete", projectId: projectOneId, startAgoMs: 10 * 60_000, endAgoMs: 5 * 60_000, note: "Client review" },
    { id: "p2-complete", projectId: projectTwoId, startAgoMs: 8 * 60_000, endAgoMs: 4 * 60_000, note: "Implementation" },
  ]);

  await page.getByRole("button", { name: "Project 1" }).click();
  await page.getByRole("button", { name: "Copy local" }).click();
  const localClipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(localClipboardText).toContain("Project\tStart\tEnd\tDuration\tNote");
  expect(localClipboardText).toContain("Project 1");
  expect(localClipboardText).toContain("Client review");
  expect(localClipboardText).not.toContain("Project 2");

  await page.locator(".filters").getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Copy UTC" }).click();
  const utcClipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(utcClipboardText).toContain("Project 1");
  expect(utcClipboardText).toContain("Project 2");
  expect(utcClipboardText).toContain("UTC");
});

test("S14: uploading an offline backup replaces local state", async ({ page }) => {
  const now = Date.now();
  const backup = {
    schemaVersion: 1,
    projects: [
      { id: projectOneId, name: "Restored Project", createdAt: new Date(now).toISOString(), color: "#2563eb", archived: false },
    ],
    sessions: [
      {
        id: "restored-session",
        projectId: projectOneId,
        startAt: new Date(now - 5 * 60_000).toISOString(),
        endAt: new Date(now - 2 * 60_000).toISOString(),
        note: "Restored note",
      },
    ],
    settings: { timerMode: "exclusive", staleAfterMinutes: 15, theme: "light" },
    lastSeenAt: new Date(now).toISOString(),
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(page.locator('input[value="Restored Project"]')).toBeVisible();
  await expect(page.locator('input[value="Restored note"]')).toBeVisible();
});

test("S13: saving an offline backup downloads the current tracker state", async ({ page }) => {
  await seedState(page, [
    { id: "p1-complete", projectId: projectOneId, startAgoMs: 10 * 60_000, endAgoMs: 5 * 60_000, note: "Backup note" },
  ]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save file" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^time-sessions-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const backup = JSON.parse(readFileSync(path || "", "utf8"));
  expect(backup.projects.some((project: { name: string }) => project.name === "Project 1")).toBe(true);
  expect(backup.sessions.some((session: { note: string }) => session.note === "Backup note")).toBe(true);
});

test("S15: reopening with a stale running session shows recovery controls", async ({ context }) => {
  const now = Date.now();
  const staleState = {
    schemaVersion: 1,
    projects: [
      { id: projectOneId, name: "Project 1", createdAt: new Date(now).toISOString(), color: "#2563eb", archived: false },
    ],
    sessions: [
      {
        id: "stale-active",
        projectId: projectOneId,
        startAt: new Date(now - 20 * 60_000).toISOString(),
        endAt: null,
        note: "",
      },
    ],
    settings: { timerMode: "exclusive", staleAfterMinutes: 15, theme: "light" },
    lastSeenAt: new Date(now - 20 * 60_000).toISOString(),
  };
  const recoveryPage = await context.newPage();
  await recoveryPage.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: staleState },
  );

  await recoveryPage.goto("/");
  await expect(recoveryPage.getByText("1 session was running while this tab was away.")).toBeVisible();
  await recoveryPage.getByRole("button", { name: "End at last activity" }).click();
  expect(await runningSessionCount(recoveryPage)).toBe(0);
  await recoveryPage.close();
});
