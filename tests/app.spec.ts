import { expect, test } from "@playwright/test";

const nonZeroDuration = /(?:[1-9]\d*h|[1-9]\d*m|[1-9]\d*s)/;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

function projectCard(page: import("@playwright/test").Page, name: string) {
  return page.locator(".project-card").filter({ has: page.locator(`input[value="${name}"]`) });
}

function projectDuration(card: ReturnType<typeof projectCard>) {
  return card.locator(".project-meta span").first();
}

test("records clean sessions when switching projects in single-active mode", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const projectOne = projectCard(page, "Project 1");
  const projectTwo = projectCard(page, "Project 2");

  await projectOne.getByRole("button", { name: "Start" }).click();
  await expect(projectOne.getByText("running")).toBeVisible();

  await page.waitForTimeout(1100);
  await projectTwo.getByRole("button", { name: "Start" }).click();

  await expect(projectTwo.getByText("running")).toBeVisible();
  await expect(projectOne.getByText("1 sessions")).toBeVisible();
  await expect(page.locator(".session-card").filter({ hasText: "Running" })).toHaveCount(1);

  await page.locator(".note-input").first().fill("Waiting on review");
  await page.getByRole("button", { name: "Copy local" }).click();

  const localClipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(localClipboardText).toContain("Project\tStart\tEnd\tDuration\tNote");
  expect(localClipboardText).toContain("Project 1");
  expect(localClipboardText).toContain("Project 2");
  expect(localClipboardText).toContain("Waiting on review");

  await page.getByRole("button", { name: "Copy UTC" }).click();
  const utcClipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(utcClipboardText).toContain("UTC");
});

test("resume keeps the cumulative project timer instead of resetting to zero", async ({ page }) => {
  const projectOne = projectCard(page, "Project 1");

  await projectOne.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1100);
  await projectOne.getByRole("button", { name: "Pause" }).click();

  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);

  await projectOne.getByRole("button", { name: "Resume" }).click();
  await expect(projectOne.getByText("running")).toBeVisible();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
});

test("project switching and later resume preserve each project's cumulative total", async ({ page }) => {
  const projectOne = projectCard(page, "Project 1");
  const projectTwo = projectCard(page, "Project 2");

  await projectOne.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1100);
  await projectTwo.getByRole("button", { name: "Start" }).click();

  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
  await expect(projectTwo.getByText("running")).toBeVisible();

  await page.waitForTimeout(1100);
  await projectOne.getByRole("button", { name: "Resume" }).click();

  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
  await expect(projectDuration(projectTwo)).toHaveText(nonZeroDuration);
  await expect(page.locator(".session-card").filter({ hasText: "Running" })).toHaveCount(1);
});

test("backdating a pause and resuming preserves corrected project time", async ({ page }) => {
  const projectOne = projectCard(page, "Project 1");

  await projectOne.getByRole("button", { name: "Start" }).click();
  const tenMinutesAgo = await page.evaluate(() => {
    const date = new Date(Date.now() - 10 * 60_000);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  });
  const startInput = page.locator('[data-action="edit-session-start"]').first();
  await startInput.fill(tenMinutesAgo);
  await startInput.dispatchEvent("change");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("End this running session");
    await dialog.accept("5");
  });
  await projectOne.getByRole("button", { name: "Backdate" }).click();

  await expect(projectOne.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);

  await projectOne.getByRole("button", { name: "Resume" }).click();
  await expect(projectOne.getByText("running")).toBeVisible();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
});

test("backdating beyond the current resumed segment does not fail", async ({ page }) => {
  const projectOne = projectCard(page, "Project 1");

  await projectOne.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1100);
  await projectOne.getByRole("button", { name: "Pause" }).click();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);

  await projectOne.getByRole("button", { name: "Resume" }).click();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("End this running session");
    await dialog.accept("5");
  });
  await projectOne.getByRole("button", { name: "Backdate" }).click();

  await expect(page.getByText("Paused at the start of the current run")).toBeVisible();
  await expect(projectOne.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(projectDuration(projectOne)).toHaveText(nonZeroDuration);
});
