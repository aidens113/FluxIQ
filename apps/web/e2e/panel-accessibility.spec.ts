// Axe on the panel screens the first baseline did not cover: Data (list and an open table), Security and its two
// sub-pages, Settings and each Settings tool. Same strictness as the existing surface certification
// (`certifyAccessibilitySurface`): no critical violation and a main landmark; the inventory is written beside the
// test's other output. Runs against the fixture host (see e2e/README.md); no model call is made.
import { expect, test, type Page } from "@playwright/test";
import { certifyAccessibilitySurface } from "./support/accessibility";
import { readUiFixtureManifest, type PanelFixture, type UiFixtureManifest } from "./support/app-fixture";
import { panelFixtureOf, signInToPanel } from "./support/panel-fixture";

let manifest: UiFixtureManifest;
let fixture: PanelFixture;

test.setTimeout(120_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
  fixture = panelFixtureOf(manifest);
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

async function open(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator("main").getByText(/^Loading/)).toHaveCount(0, { timeout: 30_000 });
}

const SCREENS = [
  ["/data", "Data", "data"], ["/security", "Security", "security"], ["/security/keys", "Keys", "security-keys"],
  ["/security/sign-in", "Your sign-in", "security-sign-in"], ["/settings", "Settings", "settings"],
  ["/settings/background-tasks", "Background Tasks", "settings-background-tasks"], ["/settings/deployment-sync", "Deployment Sync", "settings-deployment-sync"],
  ["/settings/database-manager", "Database Manager", "settings-database-manager"], ["/settings/docs", "Docs", "settings-docs"],
  ["/settings/runtime", "Runtime", "settings-runtime"], ["/settings/compute-control", "Compute Control", "settings-compute-control"],
  ["/settings/production-runner", "Production Runner", "settings-production-runner"]
] as const;

for (const [path, heading, name] of SCREENS) {
  test(`${path} has no critical axe violation and a main landmark`, async ({ page }, testInfo) => {
    await open(page, path, heading);
    await certifyAccessibilitySurface(page, testInfo, name);
  });
}

test("an open Data table has no critical axe violation", async ({ page }, testInfo) => {
  await open(page, "/data", "Data");
  await page.getByRole("button", { name: fixture.dataset.name, exact: true }).click();
  await expect(page.getByRole("region", { name: `Rows of ${fixture.dataset.name}` }).getByRole("table")).toBeVisible({ timeout: 30_000 });
  await certifyAccessibilitySurface(page, testInfo, "data-open-table");
});

test("Settings with Advanced open has no critical axe violation", async ({ page }, testInfo) => {
  await open(page, "/settings", "Settings");
  await page.locator("details.settings-advanced").getByText("Advanced", { exact: true }).click();
  await certifyAccessibilitySurface(page, testInfo, "settings-advanced-open");
});

test("the light theme has no critical axe violation on Security and Data", async ({ page }, testInfo) => {
  await open(page, "/settings", "Settings");
  await page.getByRole("radio", { name: "Light" }).check();
  for (const [path, heading, name] of [["/security", "Security", "security-light"], ["/data", "Data", "data-light"]] as const) {
    await open(page, path, heading);
    await certifyAccessibilitySurface(page, testInfo, name);
  }
});
