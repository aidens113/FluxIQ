import { expect, test } from "@playwright/test";
import {
  assertResponsiveSurface,
  authenticate,
  captureState,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";

test("certifies Studio default, menu, modal, and collapsed shell states", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(manifest.projects.representative.name, { exact: true })).toBeVisible();
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-default");

  const projectActions = page.getByRole("button", { name: `${manifest.projects.representative.name} actions` });
  await projectActions.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-menu-open");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Project$/u }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-modal-open");
  await page.keyboard.press("Escape");

  await openFixtureProject(page, manifest.projects.representative);
  const collapse = page.getByRole("button", { name: /Collapse hierarchy/u });
  if (await collapse.isVisible()) await collapse.click();
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-collapsed");
});

test("certifies Studio loading, empty, error, and populated states", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);

  await page.route("**/api/programs/automation-studio/projects*", () => new Promise(() => undefined));
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Loading projects...")).toBeVisible();
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-loading");
  await page.unroute("**/api/programs/automation-studio/projects*");

  await page.route("**/api/programs/automation-studio/projects*", async (route) => route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "Responsive certification failure state." }),
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Responsive certification failure state.")).toBeVisible();
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-error");
  await page.unroute("**/api/programs/automation-studio/projects*");

  await openFixtureProject(page, manifest.projects.empty);
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-empty");

  await openFixtureProject(page, manifest.projects.representative);
  await assertResponsiveSurface(page);
  await captureState(page, testInfo, "phase7-studio-populated");
});
