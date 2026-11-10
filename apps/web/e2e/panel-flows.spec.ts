// The Flow editor in a real browser: a Flow opens as a numbered list of steps, a step's words change and
// the change is undone, an earlier version is restored, and an edit made while FluxIQ changed the Flow
// shows the conflict banner and saves nothing. Runs against the fixture host (see e2e/README.md); no model
// call is made and no Flow is run. Each test leaves the Flow's steps as it found them (undo, restore).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readUiFixtureManifest, type FixtureProject, type PanelFixture, type UiFixtureManifest } from "./support/app-fixture";
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

const stepsSection = (page: Page) => page.getByRole("region", { name: "Steps" });
const stepNumbers = (page: Page) => stepsSection(page).getByRole("button", { name: /^Step \d+(\.\d+)*: / });

/** Opens the seeded Flow whose Subflow graph holds the four editable steps, and returns the first step a person can change. */
async function openEditableFlow(page: Page): Promise<{ project: FixtureProject; flowId: string; number: string; words: string }> {
  const project: FixtureProject = { id: fixture.projectId, name: fixture.projectName };
  const flowId = fixture.editableFlowId;
  await page.goto(`/flows/${encodeURIComponent(flowId)}?project=${encodeURIComponent(project.id)}`, { waitUntil: "domcontentloaded" });
  await expect(stepsSection(page)).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const edit = stepsSection(page).getByRole("button", { name: /^Edit step / }).first();
  await expect(edit, "the seeded Flow must have a step a person can change").toBeVisible();
  const number = ((await edit.getAttribute("aria-label")) ?? "").replace(/^Edit step /, "");
  const pick = stepsSection(page).getByRole("button", { name: new RegExp(`^Step ${number.replace(/\./g, "\\.")}: `) });
  const words = ((await pick.getAttribute("aria-label")) ?? "").replace(/^Step [\d.]+: /, "").replace(/\. (Picked|Pick it) for the assistant$/, "");
  return { project, flowId, number, words };
}

async function renameStep(page: Page, number: string, words: string): Promise<void> {
  await stepsSection(page).getByRole("button", { name: `Edit step ${number}` }).click();
  await stepsSection(page).getByRole("group", { name: `Change step ${number}` }).getByRole("button", { name: "Change words" }).click();
  const field = stepsSection(page).getByRole("textbox", { name: `What step ${number} does, in words` });
  await field.fill(words);
  await stepsSection(page).getByRole("button", { name: "Save words" }).click();
}

function banner(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: /Saved as version|Undone|Restored version/ });
}

test("a Flow opens as a numbered list of steps under its name, status line and interface", async ({ page }) => {
  await openEditableFlow(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Flows" })).toHaveAttribute("href", "/flows");
  await expect(page.getByRole("button", { name: "▶ Run" })).toBeVisible();
  await expect(page.getByText(/version \d+/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "What this Flow needs and gives" })).toBeVisible();
  expect(await stepNumbers(page).count()).toBeGreaterThan(0);
  await expect(stepNumbers(page).first()).toHaveText(/^\d+$/);
  // Plain words only: no node type ids on the page.
  expect(await page.locator("main").innerText()).not.toMatch(/builtin\.[a-z]+\./);
});

test("renaming a step saves a version, and Undo puts the words back", async ({ page }) => {
  const { number, words } = await openEditableFlow(page);
  const renamed = `Renamed by the browser test ${Date.now()}`;
  await renameStep(page, number, renamed);
  await expect(banner(page)).toContainText(/Saved as version \d+\./, { timeout: 30_000 });
  await expect(stepsSection(page).getByText(renamed)).toBeVisible();
  // This Flow has never run, so the status line says "Not run yet"; "Changed, not yet run whole" needs an earlier run
  // (covered by the status-line unit tests). The save banner is what says it has not run since.
  await expect(banner(page)).toContainText("It has not run whole since.");
  await banner(page).getByRole("button", { name: "Undo" }).click();
  await expect(banner(page)).toContainText(/Undone\. Saved as version \d+\./, { timeout: 30_000 });
  await expect(stepsSection(page).getByText(renamed)).toHaveCount(0);
  await expect(stepsSection(page).getByRole("button", { name: new RegExp(`^Step ${number.replace(/\./g, "\\.")}: `) })).toHaveAttribute("aria-label", new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("History lists versions with who and why, and Restore puts an earlier one back in one press", async ({ page }) => {
  const { number } = await openEditableFlow(page);
  const renamed = `Version to restore past ${Date.now()}`;
  await renameStep(page, number, renamed);
  await expect(banner(page)).toContainText(/Saved as version (\d+)\./, { timeout: 30_000 });
  await page.getByRole("button", { name: "History" }).click();
  const versions = page.getByRole("complementary", { name: "Versions" });
  await expect(versions).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(versions.getByText(/\(now\)/)).toBeVisible();
  await expect(versions.getByText(/A person/).first()).toBeVisible();
  await versions.getByRole("button", { name: /^Restore Version \d+$/ }).first().click();
  await expect(banner(page)).toContainText(/Restored version \d+\. Saved as version \d+\./, { timeout: 30_000 });
  await expect(stepsSection(page).getByText(renamed)).toHaveCount(0);
});

test("an edit made while FluxIQ changed the Flow shows the conflict banner and saves nothing", async ({ page }) => {
  const { project, flowId, number } = await openEditableFlow(page);
  // FluxIQ repaired the Flow between the person's read and their save: answered as the endpoint answers it,
  // with the Flow as it is now (read from the real endpoint) and who changed which step.
  await page.route("**/api/programs/automation-studio/edit-flow-steps*", async (route) => {
    const now = await route.fetch({
      url: route.request().url().replace("edit-flow-steps", "get-flow-outline"),
      method: "POST",
      headers: { ...route.request().headers(), "content-type": "application/json" },
      postData: JSON.stringify({ projectId: project.id, flowId })
    });
    const read = await now.json() as { payload: { outline: unknown; revision: number } };
    const revision = read.payload.revision;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        payload: {
          ok: false,
          conflict: { status: "conflict", flowId, baseRevision: revision, currentRevision: revision + 1, conflictingEntityIds: [], changedBy: [{ revisionNumber: revision + 1, madeBy: "repair", madeByLabel: "FluxIQ repair", message: "Repaired the step", createdAt: Date.now() }], steps: [number] },
          outline: read.payload.outline,
          revision: revision + 1
        }
      })
    });
  });
  await renameStep(page, number, `Never saved ${Date.now()}`);
  const conflict = page.getByRole("alert").filter({ hasText: "This Flow changed while you were editing" });
  await expect(conflict).toContainText(`(FluxIQ repair changed step ${number}). Your change was not saved.`);
  await expect(conflict.getByRole("button", { name: "Apply mine again" })).toBeVisible();
  await conflict.getByRole("button", { name: "See what changed" }).click();
  await expect(conflict.getByRole("list", { name: "What changed" })).toContainText("FluxIQ repair");
  await expect(stepsSection(page).getByText("changed", { exact: true })).toBeVisible();
});

test("a phone has no sideways scroll on the Flow list or the editor", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const { project } = await openEditableFlow(page);
  await stepsSection(page).getByRole("button", { name: /^Edit step / }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.goto("/flows", { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Project" }).selectOption(project.id);
  await expect(page.getByRole("region", { name: "Flows in this project" })).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
