// The Flows list and a Flow's graph page in a real browser: the seeded project's Flows are listed with how each last
// ran, search narrows them, a Flow opens from its row, and the graph page draws the Flow's steps with a way back.
// The editor itself is covered by panel-flows.spec.ts. Runs against the fixture host (see e2e/README.md); no model
// call is made and nothing is saved.
import { expect, test, type Page } from "@playwright/test";
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

const listing = (page: Page) => page.getByRole("region", { name: "Flows in this project" });

async function openList(page: Page) {
  await page.goto("/flows", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Flows" })).toBeVisible();
  await page.getByRole("combobox", { name: "Project" }).selectOption(fixture.projectId);
  await expect(listing(page)).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
}

test("the project's Flows are listed by name, each with an Open link and how it last ran", async ({ page }) => {
  await openList(page);
  for (const name of ["Old search", "Spare copy", "Cheapest listings"]) {
    const row = listing(page).getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(row, name).toHaveCount(1);
    await expect(row.getByRole("link", { name: `Open ${name}` })).toHaveAttribute("href", new RegExp(`^/flows/[^/?]+\\?project=${fixture.projectId}`));
    // A Flow's last run is a link to that run, or the words "Not run yet".
    await expect(row.getByRole("link", { name: new RegExp(`^Last run of ${name}: `) }).or(row.getByText("Not run yet"))).toBeVisible();
  }
  const oldSearch = listing(page).getByRole("listitem").filter({ has: page.getByRole("link", { name: "Old search", exact: true }) });
  await expect(oldSearch.getByRole("link", { name: /^Last run of Old search: / })).toHaveAttribute("href", /^\/runs\/[^/]+$/);
});

test("search narrows the list, and a search with no match says so", async ({ page }) => {
  await openList(page);
  const search = listing(page).getByRole("searchbox", { name: "Search" });
  await search.fill("cheapest");
  await expect(listing(page).getByRole("link", { name: "Cheapest listings", exact: true })).toBeVisible();
  await expect(listing(page).getByRole("link", { name: "Old search", exact: true })).toHaveCount(0);
  await search.fill("zzz no such flow");
  await expect(listing(page).getByText("No Flow matches that search.")).toBeVisible();
  await search.fill("");
  await expect(listing(page).getByRole("link", { name: "Old search", exact: true })).toBeVisible();
});

test("a Flow opens from its row", async ({ page }) => {
  await openList(page);
  await listing(page).getByRole("link", { name: "Open Cheapest listings" }).click();
  await expect(page).toHaveURL(new RegExp(`/flows/${encodeURIComponent(fixture.editableTopFlowId).replace(/\./g, "\\.")}`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Flows" })).toHaveAttribute("href", "/flows");
});

test("the graph page draws every step of the Flow and links back to the Flow", async ({ page }) => {
  await page.goto(`/flows/${encodeURIComponent(fixture.editableFlowId)}/graph?project=${encodeURIComponent(fixture.projectId)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /: graph$/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Back to the Flow" })).toHaveAttribute("href", new RegExp(`^/flows/${encodeURIComponent(fixture.editableFlowId).replace(/\./g, "\\.")}`));
  const actions = page.getByRole("group", { name: "Graph changes" });
  for (const name of ["Undo", "Redo", "Save"]) await expect(actions.getByRole("button", { name })).toBeVisible();
  await expect(page.getByText(/^Opening the graph/)).toHaveCount(0, { timeout: 30_000 });
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(fixture.stepLabels.length, { timeout: 30_000 });
  for (const label of fixture.stepLabels) await expect(nodes.filter({ hasText: label })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Step details" })).toBeVisible();
});
