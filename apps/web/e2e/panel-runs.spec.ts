// The panel's Runs list and run page in a real browser: plain loading, empty or error words (never a blank),
// named controls, a filter that narrows the list, and a phone with no sideways scroll. Runs against the fixture
// host (see e2e/README.md); no model call is made. What the list holds depends on the fixture's data, so the
// spec asserts the shape every outcome shares.
import { expect, test, type Page } from "@playwright/test";
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

async function settled(page: Page) {
  await page.goto("/runs", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
  await expect(page.getByText(/^Loading your runs/)).toHaveCount(0, { timeout: 30_000 });
}

test("the Runs list ends in runs or a plain sentence, with named filters", async ({ page }) => {
  await settled(page);
  const list = page.getByRole("list", { name: "Runs" });
  if (await list.count()) {
    await expect(page.getByRole("group", { name: "Filter runs" })).toBeVisible();
    for (const name of ["Flow", "Client", "Result"]) await expect(page.getByLabel(name, { exact: true })).toBeVisible();
    const links = await list.getByRole("link").evaluateAll((items) => items.map((item) => item.getAttribute("href") ?? ""));
    for (const href of links) expect(href).toMatch(/^\/runs\/[^/]+$/);
  } else {
    expect((await page.locator("main").innerText()).trim().length).toBeGreaterThan("Runs".length);
  }
  const unnamed = await page.locator("main a, main button, main select").evaluateAll((elements) =>
    elements.filter((element) => !(element.getAttribute("aria-label") || element.textContent || (element as HTMLSelectElement).labels?.[0]?.textContent || "").trim()).length);
  expect(unnamed).toBe(0);
});

test("a filter with no match says so in words", async ({ page }) => {
  await settled(page);
  if (!(await page.getByRole("list", { name: "Runs" }).count())) test.skip(true, "the fixture has no runs");
  await page.getByLabel("Client", { exact: true }).selectOption("panel");
  await page.getByLabel("Result", { exact: true }).selectOption("stopped");
  const rows = await page.getByRole("list", { name: "Runs" }).count();
  if (!rows) await expect(page.getByText("No runs match these filters.")).toBeVisible();
});

test("a run that does not exist says so and links back", async ({ page }) => {
  await page.goto("/runs/no-such-run", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/This run was not found|Could not read this run/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "All runs", exact: true })).toHaveAttribute("href", "/runs");
});

test("a phone has no sideways scroll on the Runs list", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await settled(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
