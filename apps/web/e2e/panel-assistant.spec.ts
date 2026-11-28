// The panel's tools in a real browser, answered by the fixture host's scripted models (no provider is called and
// nothing is spent; see e2e/README.md, "Panel specs"): a request to rename a step changes the Flow's steps, a request
// that names a Flow to delete deletes it with no card, and a bare "delete it" with nothing picked shows an Allow card
// that runs the call once. The server must run with FLUXIQ_E2E_SCRIPTED_ASSISTANT=1, and the fixture is changed by
// every run, so seed again before the next.
//
// Every chat belongs to a project (t1095): a message typed into the dock is a project conversation, read first by the
// project chat, which hands anything else in the FluxIQ panel to the panel assistant (Core's `panel.assistant`). On the
// fixture host that reading comes from the same script: a scenario's message is handed over, and the assistant then
// replays the scenario's turns into the project's thread. Its Allow card is answered through the project's own
// conversation. A chat from before every chat had a project still answers where it lives.
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
/** What the project chat says when it hands a message to the panel's tools (`commands/panel-assistant/hand-off.ts`). */
const HANDED_OVER = "I'll work on that with the panel's own tools here.";
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
  // The project chat read the message and handed it to the panel's tools, which did the work in the same thread.
  await expect(assistantDock(page).getByText(HANDED_OVER)).toBeVisible({ timeout: 60_000 });
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
  await expect(assistantDock(page).getByText(HANDED_OVER)).toBeVisible({ timeout: 60_000 });
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
  // Runs has nothing picked, so the words do not say which Flow "it" is. No project is open either, so the chat starts
  // in the person's own project (Core's first-project), which the top bar then opens.
  await page.goto("/runs", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("combobox", { name: "Project" })).toHaveValue("");
  await sendToAssistant(page, "delete it");
  await expect(assistantDock(page).getByText(HANDED_OVER)).toBeVisible({ timeout: 60_000 });
  await expect(assistantDock(page).getByText(/Delete the Flow “Spare copy”\?/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("combobox", { name: "Project" })).not.toHaveValue("");
  await expect(allowButton(page)).toBeVisible();
  // Nothing ran yet.
  expect(await flowNames(page)).toContain("Spare copy");
  await allowButton(page).click();
  await expect(assistantDock(page).getByText("I deleted the Flow.")).toBeVisible({ timeout: 60_000 });
  await expect(allowButton(page)).toHaveCount(0);
  expect(await flowNames(page)).not.toContain("Spare copy");
});

test("a chat from before every chat had a project still answers on the panel's tools, where it lives", async ({ page }) => {
  await writeAssistantScript(manifest, [{ when: "anything new in the earlier chat", turns: [] }], "Still answering in the earlier chat.");
  // Such a chat is the person's own, with no project: made here as the dock made them before.
  const conversationId = await page.evaluate(async () => {
    const response = await fetch("/api/programs/automation-studio/open-panel-thread", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Earlier chat" }) });
    const body = await response.json() as { payload?: { conversation?: { conversationId?: string } } };
    return body.payload?.conversation?.conversationId ?? "";
  });
  expect(conversationId).not.toBe("");
  // Its address names no project, and it opens where it lives, never on a made-up project.
  await page.goto(`/chats/${encodeURIComponent(conversationId)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("This chat was started before every chat belonged to a project.")).toBeVisible({ timeout: 30_000 });
  const thread = page.locator(".chats-thread-body");
  const box = thread.getByRole("textbox", { name: "Message to FluxIQ" });
  await expect(box).toBeEnabled({ timeout: 30_000 });
  await box.fill("Anything new in the earlier chat?");
  await box.press("Enter");
  await expect(thread.getByText("Still answering in the earlier chat.")).toBeVisible({ timeout: 60_000 });
  // The project chat never read it: it went straight to the panel's tools, in the person's own chat.
  await expect(thread.getByText(HANDED_OVER)).toHaveCount(0);
});
