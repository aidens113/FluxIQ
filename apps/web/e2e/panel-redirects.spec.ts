// The old panel's addresses land on the pages that replaced them, and the pages that stay are not
// redirected. Runs against the fixture host (see e2e/README.md); no model call is made.
import { expect, test } from "@playwright/test";
import { readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";
import { signInToPanel } from "./support/panel-fixture";

const REDIRECTS = [
  ["/programs/automation-studio", "/flows"],
  ["/programs/automation-studio?project=p1&flow=f1&view=flow-nodes", "/flows?project=p1&flow=f1&view=flow-nodes"],
  ["/programs/automation-studio/runs/older/link", "/flows"],
  ["/programs/automation-studio/chat", "/?chat=open"],
  ["/programs/automation-studio/chat?projectId=p1", "/?chat=open&projectId=p1"],
  ["/programs/identity-access", "/security/sign-in"],
  ["/programs/secret-keys", "/security/keys"],
  ["/programs/secret-keys?scope=global", "/security/keys?scope=global"],
  ["/programs/background-tasks", "/settings/background-tasks"],
  ["/programs/compute-control", "/settings/compute-control"],
  ["/programs/database-manager?x=1", "/settings/database-manager?x=1"],
  ["/programs/deployment-sync", "/settings/deployment-sync"],
  ["/programs/docs?doc=guide", "/settings/docs?doc=guide"],
  ["/programs/production-runner", "/settings/production-runner"],
  ["/programs/runtime", "/settings/runtime"],
  ["/programs/no-such-program", "/settings"],
  ["/programs", "/settings"],
  ["/domains", "/flows"],
  ["/domains/web", "/flows"],
  ["/domains/web/programs/docs", "/flows"],
  ["/get-started", "/"],
  ["/get-started?domainId=web", "/?domainId=web"]
] as const;

// Hosted panels keep their account pages.
const KEPT = ["/setup", "/welcome", "/reset"] as const;
const REPLACEMENTS = new Set(["/flows", "/", "/?chat=open", "/security/keys", "/security/sign-in", "/settings", "/settings/docs"]);

function sameAddress(location: string, expected: string): void {
  const got = new URL(location, "http://panel.invalid");
  const want = new URL(expected, "http://panel.invalid");
  expect(got.pathname).toBe(want.pathname);
  expect(Object.fromEntries(got.searchParams)).toEqual(Object.fromEntries(want.searchParams));
}

for (const [from, to] of REDIRECTS) {
  test(`${from} goes to ${to}`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(307);
    sameAddress(response.headers().location ?? "", to);
  });
}

for (const path of KEPT) {
  test(`${path} stays where it is`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    // The page answers for itself (a local panel has no `/setup`, so that one is 404); only none of
    // the old addresses' redirects may catch it.
    const location = response.headers().location;
    if (!location) return;
    const target = new URL(location, "http://panel.invalid");
    expect(REPLACEMENTS.has(target.pathname + target.search), `${path} -> ${location}`).toBe(false);
  });
}

test.describe("signed in", () => {
  let manifest: UiFixtureManifest;

  test.setTimeout(120_000);

  test.beforeAll(async () => {
    manifest = await readUiFixtureManifest();
  });

  test.beforeEach(async ({ page }) => {
    await signInToPanel(page, manifest);
  });

  test("an old Studio link opens the Flows page", async ({ page }) => {
    await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/flows$/);
    await expect(page.getByRole("heading", { level: 1, name: "Flows" })).toBeVisible();
  });

  test("the old chat page opens Home with the assistant asked for", async ({ page }) => {
    await page.goto("/programs/automation-studio/chat", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/\?chat=open$/);
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  });

  test("an old keys link opens the Keys page under Security", async ({ page }) => {
    await page.goto("/programs/secret-keys", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/security\/keys$/);
    await expect(page.getByRole("heading", { level: 1, name: "Keys" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Key" })).toBeVisible();
  });

  test("an old account link opens Your sign-in under Security", async ({ page }) => {
    await page.goto("/programs/identity-access", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/security\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your sign-in" })).toBeVisible();
  });

  test("an old engine tool link opens that tool under Settings", async ({ page }) => {
    await page.goto("/programs/docs", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/settings\/docs$/);
    await expect(page.getByRole("heading", { level: 1, name: "Docs" })).toBeVisible();
  });

  test("an old link to a program that never had a page opens Settings", async ({ page }) => {
    await page.goto("/programs/no-such-program", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  });

  test("a graph link that names no project sends the person back to the Flow", async ({ page }) => {
    await page.goto("/flows/flow.unknown/graph", { waitUntil: "domcontentloaded" });
    const note = page.getByRole("status").filter({ hasText: "does not say which project" });
    await expect(note).toBeVisible();
    await expect(note.getByRole("link", { name: "Open the Flow" })).toHaveAttribute("href", "/flows/flow.unknown");
  });
});
