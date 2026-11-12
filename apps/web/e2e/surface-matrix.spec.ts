import { expect, test } from "@playwright/test";
import {
  authenticate,
  assertResponsiveSurface,
  captureState,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";

// The old program pages redirect (see panel-redirects.spec.ts); the screens that replaced them are captured here.
const panelSurfaces = [
  ["security", "Security"],
  ["security/keys", "Keys"],
  ["security/sign-in", "Your sign-in"],
  ["settings", "Settings"],
  ["settings/background-tasks", "Background Tasks"],
  ["settings/compute-control", "Compute Control"],
  ["settings/database-manager", "Database Manager"],
  ["settings/deployment-sync", "Deployment Sync"],
  ["settings/docs", "Docs"],
  ["settings/production-runner", "Production Runner"],
  ["settings/runtime", "Runtime"],
] as const;

for (const [path, title] of panelSurfaces) {
  test(`captures the ${title} default surface`, async ({ page }, testInfo) => {
    const manifest = await readUiFixtureManifest();
    await authenticate(page, manifest);
    await page.goto(`/${path}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await assertResponsiveSurface(page);
    await captureState(page, testInfo, `panel-${path.replace("/", "-")}-default`);
  });
}

test("keeps capability inventories inside Technical Details", async ({ page }) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.goto("/settings/database-manager", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("tab", { name: "Storage" })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Technical details" });
  await trigger.click();
  const details = page.getByRole("dialog", { name: "Technical details", exact: true });
  await expect(details).toBeVisible();
  await expect(details).toHaveClass(/drawer-panel/u);
  await details.getByRole("tab", { name: "Storage" }).click();
  await expect(details.getByRole("heading", { name: "Storage" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(trigger).toBeFocused();
});


const studioViews = [
  "Connected browsers",
  "Recorded steps",
  "Steps",
  "Choose a path",
  "Reusable parts",
  "Guidance for the assistant",
  "Suggested changes",
  "Settings",
  "What the page looked like",
  "Run and test",
  "Problems",
  "Details",
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
