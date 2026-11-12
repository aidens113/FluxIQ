// The panel's Data screen in a real browser: the seeded table is listed with its Flow and row count, opens into its
// rows, filters narrow the list, and the CSV and JSON exports point at the download route and download the rows.
// Runs against the fixture host (see e2e/README.md); the table is the one `seed-fixtures.mjs` stores under the
// "Old search" Flow's newest run. No model call is made.
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

async function openData(page: Page) {
  await page.goto("/data", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Data" })).toBeVisible();
  await expect(page.getByText(/^Loading your data/)).toHaveCount(0, { timeout: 30_000 });
}

const tableName = () => fixture.dataset.name;
const rowsRegion = (page: Page) => page.getByRole("region", { name: `Rows of ${tableName()}` });
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function downloadPath(format: "csv" | "json"): string {
  const { projectId, runId, datasetId } = fixture.dataset;
  return `/api/programs/automation-studio/run-datasets/${encodeURIComponent(projectId)}/${encodeURIComponent(runId)}/${encodeURIComponent(datasetId)}?format=${format}`;
}

test("the seeded table is listed with its Flow, its row count and a link to its run", async ({ page }) => {
  await openData(page);
  const list = page.getByRole("list", { name: "Data" });
  await expect(list).toBeVisible();
  const row = list.getByRole("listitem").filter({ has: page.getByRole("button", { name: tableName(), exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`${fixture.dataset.rows.length} rows`);
  await expect(row).toContainText("Old search");
  await expect(row.getByRole("link", { name: "run", exact: true })).toHaveAttribute("href", `/runs/${encodeURIComponent(fixture.dataset.runId)}`);
});

test("opening a table shows its columns and every stored row", async ({ page }) => {
  await openData(page);
  await page.getByRole("button", { name: tableName(), exact: true }).click();
  await expect(rowsRegion(page)).toBeVisible();
  const table = rowsRegion(page).getByRole("table", { name: tableName() });
  await expect(table).toBeVisible({ timeout: 30_000 });
  for (const column of fixture.dataset.columns) await expect(table.getByRole("columnheader", { name: column, exact: true })).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(fixture.dataset.rows.length);
  for (const stored of fixture.dataset.rows) {
    for (const value of Object.values(stored)) await expect(table.getByRole("cell", { name: value, exact: true }).first()).toBeVisible();
  }
  await rowsRegion(page).getByRole("button", { name: "Close" }).click();
  await expect(rowsRegion(page)).toHaveCount(0);
});

test("a filter that matches nothing says so, and clearing it brings the table back", async ({ page }) => {
  await openData(page);
  const search = page.getByRole("searchbox", { name: "Search" });
  await search.fill("no such table anywhere");
  await expect(page.getByText("No data matches these filters.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Data" })).toHaveCount(0);
  await search.fill(tableName().toLowerCase());
  await expect(page.getByRole("button", { name: tableName(), exact: true })).toBeVisible();
  // The Flow filter offers only Flows that collected data: the seeded one, besides "All Flows".
  const flows = page.getByRole("combobox", { name: "Flow" });
  expect(await flows.locator("option").allTextContents()).toEqual(["All Flows", "Old search"]);
  await flows.selectOption({ label: "Old search" });
  await expect(page.getByRole("button", { name: tableName(), exact: true })).toBeVisible();
  await search.fill("no such table anywhere");
  await expect(page.getByText("No data matches these filters.")).toBeVisible();
  await search.fill("");
  await flows.selectOption("any");
  await expect(page.getByRole("button", { name: tableName(), exact: true })).toBeVisible();
});

test("Export CSV and Export JSON point at the download route, and both download the rows", async ({ page }) => {
  await openData(page);
  await page.getByRole("button", { name: tableName(), exact: true }).click();
  const csvLink = rowsRegion(page).getByRole("link", { name: "Export CSV" });
  const jsonLink = rowsRegion(page).getByRole("link", { name: "Export JSON" });
  await expect(csvLink).toHaveAttribute("href", new RegExp(`^${escaped(downloadPath("csv"))}(&domainId=.*)?$`));
  await expect(jsonLink).toHaveAttribute("href", new RegExp(`^${escaped(downloadPath("json"))}(&domainId=.*)?$`));

  const [download] = await Promise.all([page.waitForEvent("download"), csvLink.click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/u);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  for (const column of fixture.dataset.columns) expect(csv).toContain(column);
  for (const stored of fixture.dataset.rows) for (const value of Object.values(stored)) expect(csv).toContain(value);

  // Read in the page, as the browser sends it (the session cookie goes the way it does for the download itself).
  const json = await page.evaluate(async (href) => {
    const answer = await fetch(href, { credentials: "same-origin" });
    return { status: answer.status, type: answer.headers.get("content-type") ?? "", text: await answer.text() };
  }, (await jsonLink.getAttribute("href"))!);
  expect(json.status).toBe(200);
  expect(json.type).toContain("json");
  const text = json.text;
  for (const stored of fixture.dataset.rows) for (const value of Object.values(stored)) expect(text).toContain(value);
});

test("the download route refuses a signed-out caller and sends no rows", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL: baseURL! });
  try {
    const response = await anonymous.get(downloadPath("csv"));
    expect([401, 403]).toContain(response.status());
    expect(await response.text()).not.toContain(fixture.dataset.rows[0]!.title);
  } finally {
    await anonymous.dispose();
  }
});

test("a phone has no sideways scroll on Data, with the table open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openData(page);
  await page.getByRole("button", { name: tableName(), exact: true }).click();
  await expect(rowsRegion(page).getByRole("table")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
