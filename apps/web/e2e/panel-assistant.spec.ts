// The panel's assistant in a real browser, answered by the fixture host's scripted model (no provider is called and
// nothing is spent; see e2e/README.md, "Panel specs"): a request to rename a step changes the Flow's steps, a request
// that names a Flow to delete deletes it with no card, and a bare "delete it" with nothing picked shows an Allow card
// that runs the call once. The server must run with FLUXIQ_E2E_SCRIPTED_ASSISTANT=1, and the fixture is changed by
// every run, so seed again before the next.
import { expect, test, type Page } from "@playwright/test";
import { readUiFixtureManifest, type PanelFixture, type UiFixtureManifest } from "./support/app-fixture";
import { assistantDock, panelFixtureOf, sendToAssistant, signInToPanel, writeAssistantScript } from "./support/panel-fixture";

const TOOLS = {
  outline: "automation-studio__get-flow-outline",
  editSteps: "automation-studio__edit-flow-steps",
  deleteFlow: "automation-studio__delete-flow"
} as const;

let manifest: UiFixtureManifest;
let fixture: PanelFixture;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
  fixture = panelFixtureOf(manifest);
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

const stepsSection = (page: Page) => page.getByRole("region", { name: "Steps" });
const allowButton = (page: Page) => assistantDock(page).getByRole("button", { name: "Allow", exact: true });

/** The names of the Flows the engine holds for the fixture project, read as the signed-in person. */
async function flowNames(page: Page): Promise<string[]> {
  // Read from inside the page, so the request carries the browser's session cookie (it is marked Secure, which
  // the test runner's own request client will not send to a plain http address).
  const { ok, status, body } = await page.evaluate(async (projectId) => {
    const response = await fetch("/api/programs/automation-studio/list-flow-summaries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    return { ok: response.ok, status: response.status, body: await response.json() as { payload?: { flows?: Array<{ name?: string }> } } };
  }, fixture.projectId);
  expect(ok, `list-flow-summaries failed (${status})`).toBe(true);
  return (body.payload?.flows ?? []).map((flow) => flow.name ?? "");
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/flows/${encodeURIComponent(fixture.editableFlowId)}?project=${encodeURIComponent(fixture.projectId)}`, { waitUntil: "domcontentloaded" });
  await expect(stepsSection(page)).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(stepsSection(page).getByRole("button", { name: /^Step 2: / })).toBeVisible();
}

test("\"rename step 2 to ...\" changes the Flow's step, and the editor shows it", async ({ page }) => {
  const words = `Pick the cheapest item ${Date.now()}`;
  await writeAssistantScript(manifest, [{
    when: "rename step 2",
    turns: [
      { tool: TOOLS.outline, input: {}, why: "to read the steps and their version first" },
      { tool: TOOLS.editSteps, input: { baseRevision: { $answer: "revision" }, edit: { kind: "set-words", step: "2", words } }, why: "you asked for new words on step 2" }
    ]
  }], "I renamed step 2.");
  await openEditor(page);
  await sendToAssistant(page, `rename step 2 to ${words}`);
  await expect(assistantDock(page).getByText("I renamed step 2.")).toBeVisible({ timeout: 60_000 });
  // No card: renaming a step is not one of the acts that ask first.
  await expect(allowButton(page)).toHaveCount(0);
  // The editor reads the Flow when it opens, so it is opened again to read what the assistant saved.
  await openEditor(page);
  await expect(stepsSection(page).getByText(words)).toBeVisible();
});

test("\"delete Old search\" deletes that Flow with no card", async ({ page }) => {
  expect(await flowNames(page)).toContain("Old search");
  await writeAssistantScript(manifest, [{
    when: "delete old search",
    turns: [{ tool: TOOLS.deleteFlow, input: { projectId: fixture.projectId, flowId: fixture.oldSearchFlowId }, why: "you asked for that Flow to be deleted" }]
  }], "I deleted Old search.");
  await page.goto("/flows", { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Project" }).selectOption(fixture.projectId);
  await sendToAssistant(page, "delete Old search");
  await expect(assistantDock(page).getByText("I deleted Old search.")).toBeVisible({ timeout: 60_000 });
  await expect(allowButton(page)).toHaveCount(0);
  expect(await flowNames(page)).not.toContain("Old search");
});

test("\"delete it\" with nothing picked shows an Allow card, and Allow runs it once", async ({ page }) => {
  expect(await flowNames(page)).toContain("Spare copy");
  await writeAssistantScript(manifest, [{
    when: "delete it",
    turns: [{ tool: TOOLS.deleteFlow, input: { projectId: fixture.projectId, flowId: fixture.spareFlowId }, why: "you asked for it to be deleted" }]
  }], "I deleted the Flow.");
  // Runs has nothing picked, so the words do not say which Flow "it" is.
  await page.goto("/runs", { waitUntil: "domcontentloaded" });
  await sendToAssistant(page, "delete it");
  await expect(assistantDock(page).getByText(/Delete the Flow “Spare copy”\?/)).toBeVisible({ timeout: 60_000 });
  await expect(allowButton(page)).toBeVisible();
  // Nothing ran yet.
  expect(await flowNames(page)).toContain("Spare copy");
  await allowButton(page).click();
  await expect(assistantDock(page).getByText("I deleted the Flow.")).toBeVisible({ timeout: 60_000 });
  await expect(allowButton(page)).toHaveCount(0);
  expect(await flowNames(page)).not.toContain("Spare copy");
});
