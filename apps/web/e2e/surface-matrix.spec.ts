import { expect, test } from "@playwright/test";
import {
  authenticate,
  assertResponsiveSurface,
  captureState,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";

const globalPrograms = [
  ["automation-studio", "Automation Studio"],
  ["background-tasks", "Background Tasks"],
  ["compute-control", "Compute Control"],
  ["database-manager", "Database Manager"],
  ["deployment-sync", "Deployment Sync"],
  ["docs", "Documentation"],
  ["identity-access", "Identity & Access"],
  ["production-runner", "Production Runner"],
  ["secret-keys", "Secret Keys"],
] as const;

for (const [programId, title] of globalPrograms) {
  test(`captures the ${title} default surface`, async ({ page }, testInfo) => {
    const manifest = await readUiFixtureManifest();
    await authenticate(page, manifest);
    await page.goto(`/programs/${programId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await assertResponsiveSurface(page);
    await captureState(page, testInfo, `program-${programId}-default`);
  });
}


test("keeps capability inventories inside Technical Details", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.goto("/programs/database-manager", { waitUntil: "domcontentloaded" });

  const topbar = page.locator(".program-global-topbar");
  await expect(topbar.getByRole("tab", { name: "API" })).toHaveCount(0);
  await expect(topbar.getByRole("tab", { name: "Storage" })).toHaveCount(0);
  await expect(topbar.getByRole("tab", { name: "Runtime" })).toHaveCount(0);

  const trigger = page.getByRole("button", { name: "Technical details" });
  await trigger.click();
  const details = page.getByRole("dialog", { name: "Technical details", exact: true });
  await expect(details).toBeVisible();
  await expect(details).toHaveClass(/\bdrawer-panel\b/u);
  await details.getByRole("tab", { name: "Storage" }).click();
  await expect(details.getByRole("heading", { name: "Storage" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(trigger).toBeFocused();
});
const studioViews = [
  "Connected Clients",
  "Timeline",
  "Flow",
  "Router",
  "Subflows",
  "Instructions",
  "Adaptations",
  "Settings",
  "State View",
  "Runtime Debug",
  "Problems",
  "Inspector",
] as const;

test("captures every Automation Studio inner view", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.representative);

  for (const title of studioViews) {
    await page.getByRole("button", { name: "Add tab" }).first().click();
    const palette = page.locator(".automation-window-adder-panel");
    await expect(palette).toBeVisible();
    await palette.getByRole("button", { name: new RegExp(`^${escapeRegex(title)}`) }).click();
    await expect(page.locator(".automation-view.active, .automation-view-container.active").filter({ hasText: title }).first()).toBeVisible();
    await assertResponsiveSurface(page);
    await captureState(page, testInfo, `studio-view-${slug(title)}-default`);
  }
});

test("captures the scale Flow whiteboard without clipped controls", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.scale);

  const frame = page.getByLabel("Nodes whiteboard").first();
  await expect(frame).toBeVisible();
  await expect(frame.locator(".react-flow__node").first()).toBeVisible();
  await expect(frame.getByRole("toolbar", { name: "Canvas tools" })).toBeVisible();
  const bounds = await frame.boundingBox();
  expect(bounds?.width ?? 0).toBeGreaterThan(240);
  expect(bounds?.height ?? 0).toBeGreaterThan(240);
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, `studio-large-graph-${testInfo.project.name}`);
});
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
