import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("records clean sessions when switching projects in single-active mode", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const projectOne = page.locator(".project-card").filter({ has: page.locator('input[value="Project 1"]') });
  const projectTwo = page.locator(".project-card").filter({ has: page.locator('input[value="Project 2"]') });

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
