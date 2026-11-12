// The Settings page in a real browser: the sections are there with plain names, the engine tools are closed
// until opened and link to the existing program pages, and a phone has no sideways scroll.
// Runs against the fixture host (see e2e/README.md). It adds no key and removes none, so it never touches the
// fixture's stored keys, and it makes no model call.
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

test("Settings shows AI keys, the assistant's key and model, and the allowance", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "AI keys" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "The assistant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add a key" })).toBeVisible();
  // The key's own box is a password box: what is typed is never shown.
  await expect(page.getByLabel("Key", { exact: true })).toHaveAttribute("type", "password");
});

test("Advanced is closed until opened, and links each engine tool's own page", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const advanced = page.locator("details.settings-advanced");
  await expect(advanced).not.toHaveAttribute("open", "");
  await advanced.getByText("Advanced", { exact: true }).click();
  for (const [name, href] of [
    ["Background Tasks", "/settings/background-tasks"], ["Deployment Sync", "/settings/deployment-sync"], ["Database Manager", "/settings/database-manager"],
    ["Docs", "/settings/docs"], ["Runtime", "/settings/runtime"], ["Compute Control", "/settings/compute-control"],
    ["Production Runner", "/settings/production-runner"], ["Keys", "/security/keys"], ["Your sign-in", "/security/sign-in"]
  ] as const) {
    await expect(advanced.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(advanced.getByRole("link")).toHaveCount(9);
});

test("on a phone the page has no sideways scroll, with Advanced open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.locator("details.settings-advanced").getByText("Advanced", { exact: true }).click();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

/** The root's background colour as drawn, and the `--canvas` token resolved to a colour the same way (a probe painted with it). */
async function rootBackgroundAndCanvas(page: Page): Promise<{ background: string; canvas: string; token: string }> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--canvas)";
    document.body.append(probe);
    const canvas = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      background: getComputedStyle(document.documentElement).backgroundColor,
      canvas,
      token: getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim()
    };
  });
}

test("dark is the default: the root says so and is painted with the --canvas token", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const { background, canvas, token } = await rootBackgroundAndCanvas(page);
  expect(token, "the --canvas token must be defined").not.toBe("");
  expect(background).toBe(canvas);
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("Appearance switches data-theme on the root, repaints with the token, and the choice survives a reload", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const section = page.getByRole("region", { name: "Appearance" });
  await expect(section).toBeVisible();
  const choices = await section.getByRole("radio").evaluateAll((radios) => radios.map((radio) => (radio as HTMLInputElement).value));
  expect(choices).toEqual(["dark", "light", "system"]);
  const dark = await rootBackgroundAndCanvas(page);

  await section.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await rootBackgroundAndCanvas(page);
  expect(light.background).toBe(light.canvas);
  expect(light.background, "Light must paint a different canvas from Dark").not.toBe(dark.background);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  expect((await rootBackgroundAndCanvas(page)).background).toBe(light.background);

  await page.getByRole("radio", { name: "System" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();

  await page.getByRole("radio", { name: "Dark" }).check();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await rootBackgroundAndCanvas(page)).background).toBe(dark.background);
});

test("the choice is kept in this browser and applies on every panel page", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: "Light" }).check();
  for (const path of ["/", "/flows", "/security"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
});

const TOOLS = [
  ["background-tasks", "Background Tasks"], ["deployment-sync", "Deployment Sync"], ["database-manager", "Database Manager"],
  ["docs", "Docs"], ["runtime", "Runtime"], ["compute-control", "Compute Control"], ["production-runner", "Production Runner"]
] as const;

for (const [id, name] of TOOLS) {
  test(`/settings/${id} renders ${name} inside the panel shell`, async ({ page }) => {
    const response = await page.goto(`/settings/${id}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(page.locator("a.settings-tool-back")).toHaveAttribute("href", "/settings");
    await expect(page.getByRole("button", { name: "Technical details" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Assistant" })).toBeVisible();
    // The tool's own view replaces its loading words.
    await expect(page.locator("main").getByText(/^Loading/)).toHaveCount(0, { timeout: 30_000 });
  });
}

test("a tool that does not exist is refused with the not-found page", async ({ page }) => {
  await page.goto("/settings/no-such-tool", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "That page is not available" })).toBeVisible();
});
