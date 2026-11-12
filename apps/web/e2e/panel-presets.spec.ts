// A deployment's panel preset in a real browser: with FLUXIQ_PANEL_PRESET set, the nav lists only the screens the
// preset keeps, Settings lists only its tools, and a hidden screen's address is refused, not merely unlinked. The
// runner (support/run-isolated.mjs) starts one server per preset and passes the preset's name in FLUXIQ_E2E_PRESET;
// on the default panel ("full") there is nothing hidden, and the spec is skipped. Expectations are written out here
// from the preset's definition (`src/app/product/preset/panel-presets.ts`), not read from it. No model call is made.
import { expect, test, type Page } from "@playwright/test";
import { readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";
import { signInToPanel } from "./support/panel-fixture";

type Screen = { name: string; path: string };
type Expectation = { pages: Screen[]; hiddenPages: Screen[]; tools: Array<[string, string]>; hiddenTools: string[] };

const SCREENS = { Home: "/", Flows: "/flows", Runs: "/runs", Data: "/data", Security: "/security", Settings: "/settings" } as const;
const ALL_TOOLS: Array<[string, string]> = [
  ["background-tasks", "Background Tasks"], ["deployment-sync", "Deployment Sync"], ["database-manager", "Database Manager"],
  ["docs", "Docs"], ["runtime", "Runtime"], ["compute-control", "Compute Control"], ["production-runner", "Production Runner"]
];

function expectation(shown: Array<keyof typeof SCREENS>, toolIds: string[]): Expectation {
  const screen = (name: keyof typeof SCREENS): Screen => ({ name, path: SCREENS[name] });
  return {
    pages: shown.map(screen),
    hiddenPages: (Object.keys(SCREENS) as Array<keyof typeof SCREENS>).filter((name) => !shown.includes(name)).map(screen),
    tools: ALL_TOOLS.filter(([id]) => toolIds.includes(id)),
    hiddenTools: ALL_TOOLS.filter(([id]) => !toolIds.includes(id)).map(([id]) => id)
  };
}

const PRESETS: Record<string, Expectation> = {
  "data-collection": expectation(["Home", "Flows", "Runs", "Data", "Security", "Settings"], ["docs", "runtime"]),
  "task-automation": expectation(["Home", "Flows", "Runs", "Security", "Settings"], ["background-tasks", "production-runner", "docs", "runtime"])
};

const preset = process.env.FLUXIQ_E2E_PRESET ?? "full";
const expected: Expectation = PRESETS[preset] ?? expectation([], []);

let manifest: UiFixtureManifest;

test.setTimeout(120_000);
test.skip(!PRESETS[preset], `the "${preset}" panel hides nothing; this spec runs against a preset server`);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

/**
 * A refused address answers 404 and shows the not-found page and none of the screen. The middleware refuses it before
 * rendering starts; a page's own notFound() alone would stream under the root loading boundary with status 200.
 */
async function expectRefused(page: Page, path: string, screenName?: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "That page is not available" }), `${path} must be refused`).toBeVisible();
  if (screenName) await expect(page.getByRole("heading", { level: 1, name: screenName, exact: true })).toHaveCount(0);
  expect(response?.status(), `${path} must answer 404`).toBe(404);
}

const rail = (page: Page) => page.getByRole("navigation", { name: "Main" });

test(`the ${preset} nav lists exactly the screens the preset keeps, in order`, async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const labels = await rail(page).getByRole("link").evaluateAll((links) => links.map((link) => (link.textContent ?? "").trim()));
  expect(labels).toEqual(expected.pages.map((entry) => entry.name));
  for (const hidden of expected.hiddenPages) await expect(rail(page).getByRole("link", { name: hidden.name, exact: true })).toHaveCount(0);
});

test(`every screen the ${preset} preset keeps opens`, async ({ page }) => {
  for (const entry of expected.pages) {
    const response = await page.goto(entry.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), entry.path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: entry.name, exact: true })).toBeVisible();
  }
});

test(`a screen the ${preset} preset hides is refused at its address`, async ({ page }) => {
  test.skip(expected.hiddenPages.length === 0, "this preset keeps every screen");
  for (const entry of expected.hiddenPages) await expectRefused(page, entry.path, entry.name);
});

test(`Settings under ${preset} lists only the preset's tools, then Keys and Your sign-in`, async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const advanced = page.locator("details.settings-advanced");
  await advanced.getByText("Advanced", { exact: true }).click();
  const links = await advanced.getByRole("link").evaluateAll((items) => items.map((item) => ({ name: (item.textContent ?? "").trim(), href: item.getAttribute("href") })));
  expect(links.map((link) => link.href)).toEqual([
    ...expected.tools.map(([id]) => `/settings/${id}`),
    "/security/keys",
    "/security/sign-in"
  ]);
  for (const [index, [, name]] of expected.tools.entries()) expect(links[index]!.name.startsWith(name), name).toBe(true);
});

test(`a tool the ${preset} preset lists opens, and one it hides is refused`, async ({ page }) => {
  for (const [id, name] of expected.tools) {
    const response = await page.goto(`/settings/${id}`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), id).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  }
  for (const id of expected.hiddenTools) await expectRefused(page, `/settings/${id}`);
});

test(`Security and its sub-pages stay reachable under ${preset}, so an administrator is never locked out`, async ({ page }) => {
  for (const [path, heading] of [["/security", "Security"], ["/security/keys", "Keys"], ["/security/sign-in", "Your sign-in"]] as const) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
  }
});

test(`the old program address of a hidden tool does not open it under ${preset}`, async ({ page }) => {
  test.skip(expected.hiddenTools.length === 0, "this preset lists every tool");
  await page.goto(`/programs/${expected.hiddenTools[0]!}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "That page is not available" })).toBeVisible();
});
