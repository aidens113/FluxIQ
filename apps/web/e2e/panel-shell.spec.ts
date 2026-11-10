// The new panel's frame in a real browser: the six places navigate, the assistant dock is on every page,
// and a phone has no sideways scroll. Runs against the fixture host (see e2e/README.md); no model call is made.
import { expect, test, type Page } from "@playwright/test";
import { readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";
import { assistantDock as dock, openAssistantDock as openDock, signInToPanel } from "./support/panel-fixture";

const PLACES = [
  { name: "Home", path: "/", heading: "Home" },
  { name: "Flows", path: "/flows", heading: "Flows" },
  { name: "Runs", path: "/runs", heading: "Runs" },
  { name: "Data", path: "/data", heading: "Data" },
  { name: "Security", path: "/security", heading: "Security" },
  { name: "Settings", path: "/settings", heading: "Settings" }
] as const;

let manifest: UiFixtureManifest;

test.setTimeout(120_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

const rail = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("the six places navigate, and the current one says so", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const place of PLACES) {
    await rail(page).getByRole("link", { name: place.name }).click();
    await expect(page).toHaveURL(new RegExp(`${place.path === "/" ? "/$" : `${place.path}$`}`));
    await expect(page.getByRole("heading", { level: 1, name: place.heading })).toBeVisible();
    await expect(rail(page).getByRole("link", { name: place.name })).toHaveAttribute("aria-current", "page");
  }
});

test("the top bar names the project, the engine and today's spend", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("combobox", { name: "Project" })).toBeVisible();
  await expect(page.getByRole("status", { name: /^Engine: / })).toBeVisible();
  await expect(page.getByLabel(/^Spent today: /)).toBeVisible();
});

test("the assistant dock opens on every page", async ({ page }) => {
  for (const place of PLACES) {
    await page.goto(place.path, { waitUntil: "domcontentloaded" });
    await openDock(page);
    await expect(dock(page).getByText(`On ${place.heading}`)).toBeVisible();
  }
});

test("a phone has no sideways scroll on any page, with the dock shut or open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const place of PLACES) {
    await page.goto(place.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: place.heading })).toBeVisible();
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(await fits(), `${place.path} with the dock shut`).toBe(true);
    await openDock(page);
    expect(await fits(), `${place.path} with the dock open`).toBe(true);
  }
});
