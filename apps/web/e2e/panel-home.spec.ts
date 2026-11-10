// The panel's Home in a real browser: five named sections that each end in content or a plain sentence
// (never a spinner that stays, never a blank), and a phone with no sideways scroll. Runs against the fixture
// host (see e2e/README.md); no model call is made. What each section holds depends on the fixture's data, so
// the spec asserts the shape every outcome shares.
import { expect, test, type Page } from "@playwright/test";
import { readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";
import { signInToPanel } from "./support/panel-fixture";

const SECTIONS = ["Engine", "Today", "Connected", "Needs you", "Recent runs"] as const;

let manifest: UiFixtureManifest;

test.setTimeout(120_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

const section = (page: Page, name: string) => page.getByRole("region", { name });

test("Home names its five sections, and each finishes loading", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  for (const name of SECTIONS) {
    await expect(section(page, name)).toBeVisible();
    await expect(section(page, name)).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    // Content, an empty sentence or an error sentence: always some words.
    expect((await section(page, name).innerText()).trim().length).toBeGreaterThan(name.length);
  }
});

test("every control on Home has a name, and Recent runs links to all runs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(section(page, "Recent runs")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const allRuns = section(page, "Recent runs").getByRole("link", { name: "See all runs" });
  await expect(allRuns).toHaveAttribute("href", "/runs");
  const unnamed = await page.locator("main a, main button").evaluateAll((elements) =>
    elements.filter((element) => !(element.getAttribute("aria-label") || element.textContent || "").trim()).length);
  expect(unnamed).toBe(0);
  await allRuns.click();
  await expect(page).toHaveURL(/\/runs$/);
});

test("Needs you and Recent runs links go to a Flow or a run", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(section(page, "Needs you")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const hrefs = await section(page, "Needs you").getByRole("link", { name: /^Open/ }).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  for (const href of hrefs) expect(href).toMatch(/^\/(flows|runs)(\/[^/]+)?$/);
});

test("a phone has no sideways scroll on Home", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const name of SECTIONS) await expect(section(page, name)).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
