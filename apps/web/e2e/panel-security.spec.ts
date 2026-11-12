// The panel's Security screens in a real browser: the Keys list (names and state, never a key's value), who has
// access (people, their sessions, paired browsers), the activity log, and the two sub-pages (/security/keys and
// /security/sign-in). Runs against the fixture host (see e2e/README.md): its two model keys carry made-up values
// that no page may ever show, and one browser is paired with the fixture's person. No model call is made.
import { expect, test, type Page } from "@playwright/test";
import { readUiFixtureManifest, type PanelFixture, type UiFixtureManifest } from "./support/app-fixture";
import { panelFixtureOf, signInToPanel } from "./support/panel-fixture";

/** The made-up value `seedModelKeys` stores; every key's value starts with it. */
const KEY_VALUE_PREFIX = "fixture-not-a-real-key";

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

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function openSecurity(page: Page) {
  await page.goto("/security", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
  await expect(page.locator("main").getByText(/^Loading /)).toHaveCount(0, { timeout: 30_000 });
}

/** Nothing on the page, in its text or in any field, holds a stored key's value. */
async function expectNoKeyValue(page: Page) {
  expect(await page.locator("body").innerText()).not.toContain(KEY_VALUE_PREFIX);
  const fieldValues = await page.locator("input, textarea, select").evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));
  for (const value of fieldValues) expect(value).not.toContain(KEY_VALUE_PREFIX);
}

test("Security names its four parts: Keys, Your sign-in, Access and Activity", async ({ page }) => {
  await openSecurity(page);
  for (const name of ["Keys", "Your sign-in", "Access", "Activity"]) await expect(section(page, name)).toBeVisible();
  await expect(section(page, "Keys").getByRole("link", { name: "Manage keys" })).toHaveAttribute("href", "/security/keys");
  await expect(section(page, "Your sign-in").getByRole("link", { name: "Your sign-in" })).toHaveAttribute("href", "/security/sign-in");
});

test("the Keys list shows each key's name and state and never a value", async ({ page }) => {
  await openSecurity(page);
  const keys = section(page, "Keys").getByRole("list", { name: "Keys" });
  await expect(keys).toBeVisible();
  for (const name of fixture.modelKeyNames) await expect(keys.getByRole("listitem").filter({ hasText: name })).toHaveCount(1);
  await expect(keys.getByRole("listitem").first()).toContainText(/Locked|Unlocked|Turned off|Lock state not known/);
  await expectNoKeyValue(page);
});

test("Access lists the fixture's person with a session to sign out, and the paired browser", async ({ page }) => {
  await openSecurity(page);
  const people = section(page, "Access").getByRole("list", { name: "People" });
  await expect(people).toBeVisible();
  await expect(people).toContainText(manifest.credentials.username);
  const sessions = people.getByRole("list", { name: "Sign-in sessions" }).first();
  await expect(sessions).toBeVisible();
  await expect(sessions.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
  const browsers = section(page, "Access").getByRole("list", { name: "Paired browsers" });
  await expect(browsers).toBeVisible();
  await expect(browsers.getByRole("listitem").filter({ hasText: fixture.pairedClientName })).toHaveCount(1);
  await expect(browsers).toContainText("active");
});

test("the Activity log loads its entries, newest first", async ({ page }) => {
  await openSecurity(page);
  const activity = section(page, "Activity");
  await expect(activity.getByText(/^Loading activity/)).toHaveCount(0, { timeout: 30_000 });
  await expect(activity.getByRole("alert")).toHaveCount(0);
  const entries = activity.locator("ol.activity-list > li");
  expect(await entries.count(), "signing in and reading Security leaves at least one recorded action").toBeGreaterThan(0);
  const times = await entries.locator("time").evaluateAll((items) => items.map((item) => Date.parse(item.getAttribute("datetime") ?? "")));
  expect(times.every((value) => Number.isFinite(value))).toBe(true);
  expect([...times].sort((a, b) => b - a)).toEqual(times);
  await expect(entries.first()).toContainText(/Allowed|Denied/);
});

test("/security/keys is the key manager: every key by name, Add Key, a way back, and no value", async ({ page }) => {
  await page.goto("/security/keys", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Keys" })).toBeVisible();
  await expect(page.locator("a.security-back")).toHaveAttribute("href", "/security");
  await expect(page.getByRole("button", { name: "Add Key" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Technical details" })).toBeVisible();
  for (const name of fixture.modelKeyNames) await expect(page.getByText(name).first()).toBeVisible();
  await expectNoKeyValue(page);
});

test("/security/sign-in shows the person's sign-in settings and sessions", async ({ page }) => {
  await page.goto("/security/sign-in", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Your sign-in" })).toBeVisible();
  await expect(page.locator("a.security-back")).toHaveAttribute("href", "/security");
  await expect(page.getByRole("button", { name: "Technical details" })).toBeVisible();
  await expect(page.getByText(`@${manifest.credentials.username}`).first()).toBeVisible({ timeout: 30_000 });
  await expectNoKeyValue(page);
});

test("a phone has no sideways scroll on the three Security pages", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const [path, heading] of [["/security", "Security"], ["/security/keys", "Keys"], ["/security/sign-in", "Your sign-in"]] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("main").getByText(/^Loading /)).toHaveCount(0, { timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), path).toBe(true);
  }
});
