import { expect, test } from "@playwright/test";
import {
  authenticate,
  captureState,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";

test("captures the login default state", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await captureState(page, testInfo, "login-default");
});

test("captures the authenticated program launcher", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await captureState(page, testInfo, "program-launcher-default");
});

test("captures the Automation Studio project browser", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(manifest.projects.representative.name, { exact: true })).toBeVisible();
  await captureState(page, testInfo, "studio-project-browser-default");
});

test("captures project browser loading", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.route("**/api/programs/automation-studio/projects*", () => new Promise(() => undefined));
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Loading projects...")).toBeVisible();
  await captureState(page, testInfo, "studio-project-browser-loading");
});

test("captures project browser failure", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await page.route("**/api/programs/automation-studio/projects*", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Deterministic project load failure." }),
    });
  });
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Deterministic project load failure.")).toBeVisible();
  await captureState(page, testInfo, "studio-project-browser-error");
});

test("captures an empty Automation Studio project", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.empty);
  await captureState(page, testInfo, "studio-project-empty");
});

test("captures a representative Automation Studio project", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await openFixtureProject(page, manifest.projects.representative);
  await expect(page.getByLabel("Automation Studio project tree")).toBeVisible();
  await captureState(page, testInfo, "studio-project-representative");
});
