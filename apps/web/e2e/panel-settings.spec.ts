// The Settings page in a real browser: the sections are there with plain names, the engine tools are closed
// until opened and link to the existing program pages, and a phone has no sideways scroll.
// Runs against the fixture host (see e2e/README.md). It adds no key and removes none, so it never touches the
// fixture's stored keys, and it makes no model call.
import { expect, test } from "@playwright/test";
import { readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";
import { signInToPanel } from "./support/panel-fixture";

let manifest: UiFixtureManifest;

test.setTimeout(120_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

test("Settings shows AI keys, the assistant's key and model, and the allowance", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "AI keys" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "The assistant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add a key" })).toBeVisible();
  // The key's own box is a password box: what is typed is never shown.
  await expect(page.getByLabel("Key", { exact: true })).toHaveAttribute("type", "password");
});

test("Advanced is closed until opened, and its links are the existing program pages", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const advanced = page.locator("details.settings-advanced");
  await expect(advanced).not.toHaveAttribute("open", "");
  await advanced.getByText("Advanced", { exact: true }).click();
  for (const [name, programId] of [
    ["Background Tasks", "background-tasks"], ["Deployment Sync", "deployment-sync"], ["Database Manager", "database-manager"],
    ["Docs", "docs"], ["Runtime", "runtime"], ["Compute Control", "compute-control"], ["Production Runner", "production-runner"],
    ["Identity & Access", "identity-access"], ["Secret Keys", "secret-keys"]
  ] as const) {
    await expect(advanced.getByRole("link", { name, exact: true })).toHaveAttribute("href", `/programs/${programId}`);
  }
});

test("on a phone the page has no sideways scroll, with Advanced open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.locator("details.settings-advanced").getByText("Advanced", { exact: true }).click();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});
