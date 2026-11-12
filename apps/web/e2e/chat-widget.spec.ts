// The panel's docked Assistant in a real browser, as a person uses it, against the isolated fixture root and the
// panel threads `e2e/support/seed-chat-threads.mjs` wrote there (see e2e/README.md, "Chat widget"). No model call is
// made: the one typed send is answered by the fixture host's scripted assistant (the server runs with
// FLUXIQ_E2E_SCRIPTED_ASSISTANT=1), which spends nothing.
//
// The old spec drove a floating window with a launcher over the Studio workspace and a chat per project. The panel
// replaced that with an Assistant column docked beside every page (a round button on a phone) over one chat of the
// signed-in person's own, listed through the shared conversation list. Each test keeps its old intent (D, V, A, T, C,
// U ids in the titles) and finds things on the dock; what the dock no longer has is named in the report.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";
import { assistantDock, signInToPanel, writeAssistantScript } from "./support/panel-fixture";

type Seeded = {
  projectId: string;
  emptyProjectId: string;
  threads: { permission: string; destructive: string; planning: string };
  /** The small project's own threads, listed in the dock once the project is open. */
  projectThreads: { choice: string; open: string };
};

const webRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const SLOW = 60_000;

let manifest: UiFixtureManifest;
let seeded: Seeded;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
  seeded = JSON.parse(await readFile(path.join(fixtureRoot, "chat-threads-manifest.json"), "utf8")) as Seeded;
});

test.beforeEach(async ({ page }) => {
  await signInToPanel(page, manifest);
});

const dock = assistantDock;
const rows = (page: Page) => dock(page).locator(".chat-thread-row");
const threadRow = (page: Page, id: string) => dock(page).locator(`.chat-thread-row[data-conversation-id="${id}"]`);
const threadList = (page: Page) => dock(page).locator(".chat-thread-rows");
const composer = (page: Page) => dock(page).getByRole("textbox", { name: "Message to FluxIQ" });

/** On a wide screen the dock is beside the page already; on a narrow one the round button opens it. */
async function openChat(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Open the assistant" });
  if (await button.isVisible().catch(() => false)) await button.click();
  await expect(dock(page)).toBeVisible();
}

/** The conversation list: a column on a wide dock, or a drawer behind the "Chats" button on a narrow one. */
async function showThreadList(page: Page): Promise<void> {
  const toggle = dock(page).locator(".chat-thread-toggle");
  await expect(toggle.or(threadList(page)).first()).toBeVisible({ timeout: SLOW });
  if (await toggle.isVisible().catch(() => false) && !(await threadList(page).isVisible().catch(() => false))) await toggle.click();
  await expect(threadList(page)).toBeVisible({ timeout: 30_000 });
}

async function pickThread(page: Page, id: string): Promise<void> {
  const row = threadRow(page, id);
  if (!(await row.isVisible().catch(() => false))) await showThreadList(page);
  await expect(row).toBeVisible({ timeout: SLOW });
  await row.locator(".chat-thread-open").click();
}

async function shot(page: Page, name: string, testInfo: { project: { name: string } }): Promise<void> {
  await page.screenshot({ path: path.join(webRoot, "test-results", `chat-${testInfo.project.name}-${name}.png`), animations: "disabled" });
}

test("D1: the Assistant is on the Home screen with no project, on screen, and stays there while the page scrolls", async ({ page }, info) => {
  // The landing screen is Home, in the shell; the old program directory ("Programs") is gone.
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible({ timeout: SLOW });
  await openChat(page);
  await expect(page.getByRole("combobox", { name: "Project" })).toHaveValue("");
  await expect(dock(page).getByText("Assistant", { exact: true })).toBeVisible();
  // It lists the person's chats once the read lands, which is where "waiting on you" shows (D2).
  await showThreadList(page);
  await expect(rows(page).first()).toBeVisible({ timeout: SLOW });
  const box = (await dock(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  await page.mouse.wheel(0, 400);
  expect(await dock(page).boundingBox()).toEqual(box);
  await shot(page, "landing-dock", info);
});

test("V8: on Home, with every project open, the Assistant lists the person's threads and reads one with no id on screen", async ({ page }, info) => {
  await openChat(page);
  await showThreadList(page);
  await pickThread(page, seeded.threads.planning);
  await expect(dock(page).getByText("A better selector exists for the title.")).toBeVisible({ timeout: SLOW });
  await shot(page, "landing-open", info);
  await expect(dock(page)).not.toContainText(seeded.projectId);
  await expect(dock(page)).not.toContainText(seeded.threads.planning);
});

test("D2, D3, V1, V2, V7, T3, U2, U6: the Assistant's list and a thread's turns", async ({ page }, info) => {
  await page.goto("/flows", { waitUntil: "domcontentloaded" });
  await openChat(page);
  // D2, D3: the chats waiting on the person say so on their rows, with no need to open one. (The window's launcher badge is
  // gone with the window; the rows carry it now.)
  await showThreadList(page);

  // V7, V1, V2: a conversation list, not a select; "Waiting on you" on the two chats holding a card; no id on screen.
  expect(await dock(page).locator("select").count()).toBe(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(dock(page).locator(".chat-thread-waiting:visible")).toHaveCount(2);
  await expect(dock(page).locator(".chat-thread-row[data-waiting='true']")).toHaveCount(2);
  await expect(dock(page)).not.toContainText(seeded.projectId);
  for (const id of Object.values(seeded.threads)) await expect(dock(page)).not.toContainText(id);
  // Search keeps the chats with every word typed.
  const search = dock(page).locator(".chat-thread-search");
  await search.fill("planning");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Planning notes");
  await search.fill("");
  await expect(rows(page)).toHaveCount(3);

  await pickThread(page, seeded.threads.planning);
  await expect(dock(page).getByText("Anything else you want changed?")).toBeVisible({ timeout: SLOW });

  // U2: the panel's own record is a quiet FluxIQ line, never a person bubble.
  const record = dock(page).getByText("Opened the Runs view.");
  await expect(record).toBeVisible();
  await expect(dock(page).getByText("Please show me what the proposed change does.")).toBeVisible();
  await expect(dock(page).getByText("FluxIQ panel").first()).toBeAttached();
  expect(await record.evaluate((el) => !el.closest("[class*='bubble']"))).toBe(true);
  expect(await dock(page).getByText("Please show me what the proposed change does.").evaluate((el) => !!el.closest("[class*='bubble']"))).toBe(true);

  // U6: an adaptation reference is drawn as a reference. The dock has no Adaptations view to open it in (the old window
  // opened one), so it shows the reference without an Open control.
  await expect(dock(page).getByText("adaptation:adaptation.e2e.1")).toBeVisible();
  await expect(dock(page).getByRole("button", { name: /^open/iu })).toHaveCount(0);
  await shot(page, "adaptation-reference", info);
});

test("T3, T8: Show me scrolls the transcript, not the page", async ({ page }) => {
  await openChat(page);
  await pickThread(page, seeded.threads.destructive);
  const chat = dock(page);
  await expect(chat.getByRole("list", { name: "Conversation with FluxIQ" })).toHaveAttribute("aria-live", "polite");
  const scroller = chat.locator(".chat-scroll");
  await expect(chat.getByText("The run reached the old drafts list.")).toBeAttached({ timeout: 30_000 });
  const banner = chat.getByText("FluxIQ stopped here and is waiting on your answer.");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const pageBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  // As a person would: wheel up over the transcript until it is at the top, which also stops it following the tail.
  await scroller.hover();
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  await chat.getByRole("button", { name: "Show me" }).click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(pageBefore);
});

test("A1, A3, A4, A6: the permission ask settles on one press, with no PIN", async ({ page }, info) => {
  await openChat(page);
  await pickThread(page, seeded.threads.permission);
  const chat = dock(page);
  await expect(chat.getByText("FluxIQ is asking for permission.")).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByText("Allowing permits only the consequences listed here.")).toBeVisible();
  const consequences = chat.getByRole("list", { name: "Consequences requiring approval" });
  await expect(consequences).toContainText("send or publish something that others will receive or see");
  await expect(consequences).toContainText("create something new that stays");
  await expect(chat.getByText('The control is "Schedule post" (button).')).toBeVisible();
  await shot(page, "permission-ask", info);

  // Nothing inside a Flow or a chat asks for a PIN: the press is the answer, checked by Core.
  await chat.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "Allow this action" })).toBeHidden();
  await expect(chat.getByRole("button", { name: "Allow", exact: true })).toBeHidden({ timeout: 30_000 });
  // A6: the settled card keeps the chat's own sentence (nothing waited on it, so nothing ran), not a second set of buttons.
  await expect(chat.getByText("That request is no longer waiting, so nothing was run.")).toBeVisible({ timeout: 30_000 });
  await shot(page, "permission-settled", info);
});

test("A1, A3, A4: a card whose consequence is destructive settles on one press, with no PIN", async ({ page }, info) => {
  // The old spec answered a choice ask whose options were destructive. The Assistant raises Allow cards only (its answer
  // endpoint takes Allow or Don't), so the destructive consequence is carried by an Allow card here.
  await openChat(page);
  await pickThread(page, seeded.threads.destructive);
  const chat = dock(page);
  await expect(chat.getByText("FluxIQ is asking for permission.")).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByRole("list", { name: "Consequences requiring approval" })).toContainText("delete or remove something");
  await shot(page, "destructive-ask", info);
  await chat.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "Confirm this answer" })).toBeHidden();
  await expect(chat.getByRole("button", { name: "Allow", exact: true })).toBeHidden({ timeout: 30_000 });
  await expect(chat.getByRole("button", { name: "Don't allow" })).toBeHidden();
});

/** The person opens the small project in the top bar, so its threads join their own in the dock's list. */
async function openSmallProject(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: "Project" }).selectOption(seeded.projectId);
}

test("the dock lists the open project's threads beside the person's own, and only its own with no project open", async ({ page }) => {
  await openChat(page);
  await showThreadList(page);
  await expect(threadRow(page, seeded.threads.permission)).toBeVisible({ timeout: SLOW });
  await expect(threadRow(page, seeded.projectThreads.choice)).toHaveCount(0);
  await openSmallProject(page);
  // Opening a project is a new owner of the chat: it opens on the project's latest thread with the list put away, so a
  // narrow dock's drawer is opened again, as a person would, before its rows can be seen.
  await showThreadList(page);
  await expect(threadRow(page, seeded.projectThreads.choice)).toBeVisible({ timeout: SLOW });
  await expect(threadRow(page, seeded.projectThreads.open)).toBeVisible();
  await expect(threadRow(page, seeded.threads.permission)).toBeVisible();
});

test("A1, A3, A4: a project thread's choice whose options are destructive settles on one press, with no PIN", async ({ page }, info) => {
  await openSmallProject(page);
  await openChat(page);
  await pickThread(page, seeded.projectThreads.choice);
  const chat = dock(page);
  await expect(chat.getByText("FluxIQ is asking you to choose.")).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByRole("list", { name: "Consequences requiring approval" })).toContainText("delete or remove something");
  await shot(page, "project-choice-ask", info);
  // Nothing inside a chat asks for a PIN: the press is the answer, taken by the project's conversation.
  await chat.getByRole("button", { name: "Clear the oldest" }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "Confirm this answer" })).toBeHidden();
  await expect(chat.getByRole("button", { name: "Clear the oldest" })).toBeHidden({ timeout: 30_000 });
  await expect(chat.getByRole("button", { name: "Clear both" })).toBeHidden();
});

test("A2: a project thread's open ask takes words and answers", async ({ page }, info) => {
  await openSmallProject(page);
  await openChat(page);
  await pickThread(page, seeded.projectThreads.open);
  const chat = dock(page);
  const answer = chat.getByRole("textbox", { name: "Your answer" });
  await expect(answer).toBeVisible({ timeout: 30_000 });
  const send = chat.getByRole("button", { name: "Send answer" });
  await expect(send).toBeDisabled();
  await answer.fill("Weekly roundup");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(chat.getByRole("textbox", { name: "Your answer" })).toBeHidden({ timeout: 30_000 });
  await expect(chat.getByRole("button", { name: "Send answer" })).toHaveCount(0);
  await shot(page, "project-open-ask-answered", info);
});

test("C4, C1: nothing from the conversation is kept in browser storage; a typed send is answered by the scripted assistant", async ({ page }, info) => {
  await openChat(page);
  await pickThread(page, seeded.threads.planning);
  const chat = dock(page);
  await expect(chat.getByText("Please show me what the proposed change does.")).toBeVisible({ timeout: 30_000 });
  const stored = async () => page.evaluate(() => JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)]));
  const words = ["Please show me what the proposed change does", "Anything else you want changed", "Planning notes", "Cleanup run", "Weekly post build"];
  const draft = "Draft that is never sent";
  await composer(page).fill(draft);
  expect(await stored()).not.toContain(draft);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openChat(page);
  await showThreadList(page);
  const after = await stored();
  for (const word of [...words, draft]) expect(after).not.toContain(word);

  // C1: the typed turn is stored by Core and answered by the script, with no model call.
  await writeAssistantScript(manifest, [{ when: "typed from the browser spec", turns: [] }], "Scripted reply to the typed message.");
  await pickThread(page, seeded.threads.planning);
  const text = "Typed from the browser spec";
  const input = composer(page);
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await input.fill(text);
  await input.press("Enter");
  await expect(dock(page).getByText(text)).toBeVisible({ timeout: SLOW });
  await expect(dock(page).getByText("Scripted reply to the typed message.")).toBeVisible({ timeout: SLOW });
  expect(await stored()).not.toContain(text);
  await shot(page, "typed-send", info);
});

test("the composer takes words while a thread's first read is on its way, and a held send goes when it lands", async ({ page }, info) => {
  await writeAssistantScript(manifest, [{ when: "typed before the thread was read", turns: [] }], "Scripted reply to the held message.");
  await openChat(page);
  await showThreadList(page);
  // Every read of a thread waits until this test lets it go, so the new thread stays on its first read.
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/get-panel-thread*", async (route) => {
    await gate;
    await route.continue().catch(() => undefined);
  });
  try {
    // The dock opens on the thread still waiting, so this one is a thread it has not read yet.
    await pickThread(page, seeded.threads.permission);
    const box = composer(page);
    await expect(box).toBeEnabled();
    const text = "Typed before the thread was read";
    await box.fill(text);
    await box.press("Enter");
    await expect(dock(page).getByText("This goes as soon as the conversation is ready.")).toBeVisible();
    await expect(box).toHaveValue(text);
    await shot(page, "composer-held", info);
    release();
    await expect(dock(page).getByText(text)).toBeVisible({ timeout: SLOW });
    await expect(box).toHaveValue("");
    await expect(dock(page).getByText("This goes as soon as the conversation is ready.")).toBeHidden();
  } finally {
    release();
    await page.unroute("**/get-panel-thread*");
  }
});

test("V4: a person with no chats is welcomed, and the model-key line goes to Keys in this tab", async ({ page }, info) => {
  // The fixture person has chats, so the panel's two reads are answered empty here: no chat, and no enabled key.
  await page.route("**/list-panel-threads*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, payload: { conversations: [] } }) }));
  await page.route("**/api/programs/secret-keys/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, payload: { keys: [] } }) }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openChat(page);
  const chat = dock(page);
  await expect(chat.getByText("This is where FluxIQ talks to you")).toBeVisible({ timeout: SLOW });
  await expect(chat.getByText("Permission before anything lasting")).toBeVisible();
  await expect(chat.locator(".chat-thread-row")).toHaveCount(0);
  await shot(page, "welcome", info);
  // Its control goes to the Keys page in this tab, never a new one.
  await expect(chat.getByText("FluxIQ needs a model key before it can build.")).toBeVisible();
  const pages = page.context().pages().length;
  await chat.getByRole("button", { name: "Add a model key" }).click();
  await page.waitForURL(/\/security\/keys/u, { timeout: SLOW });
  expect(page.context().pages()).toHaveLength(pages);
});

test("on a phone the Assistant opens from its round button and closes again", async ({ page }, info) => {
  // The window's launcher and its Escape are gone; on a narrow screen the dock is a sheet behind this button.
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const open = page.getByRole("button", { name: "Open the assistant" });
  await expect(open).toBeVisible({ timeout: SLOW });
  await expect(dock(page)).toBeHidden();
  await open.click();
  await expect(dock(page)).toBeVisible();
  // The round button gives way to the sheet's own Close while it is open.
  await expect(open).toBeHidden();
  await showThreadList(page);
  await shot(page, "phone-open", info);
  await dock(page).getByRole("button", { name: "Close the assistant" }).click();
  await expect(dock(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the chat alone: the old chat page lands on the panel with the Assistant open", async ({ page }, info) => {
  // `/programs/automation-studio/chat` redirects to `/?chat=open` (next.config.ts), so the chat is the dock, not a page.
  await page.goto(`/programs/automation-studio/chat?projectId=${seeded.projectId}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/\?(.*&)?chat=open/u, { timeout: SLOW });
  await expect(dock(page)).toBeVisible({ timeout: SLOW });
  await showThreadList(page);
  await expect(rows(page)).toHaveCount(3, { timeout: SLOW });
  await expect(dock(page)).not.toContainText(seeded.projectId);
  await shot(page, "chat-alone", info);
});

// A panel thread belongs to no project and a turn's reference to a proposal (`flow.<id>:adaptation.<id>`) does not name
// one, so the dock reads it in the project the person has open (`get-panel-thread-attachment`). The test opens the small
// project, which holds the seeded proposal, as a person would from the top bar.
test("U5: a reference to a real proposal is resolved by Core and drawn in words, with no id on screen", async ({ page }, info) => {
  await page.getByRole("combobox", { name: "Project" }).selectOption(seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.planning);
  await expect(dock(page).getByText("Here is the change I would make to the Flow.")).toBeVisible({ timeout: SLOW });
  // U5: a real reference to a real proposal, resolved by Core and drawn: what it adds, in words, with no id on screen.
  const diff = dock(page).getByRole("table", { name: "Structural changes" });
  await expect(diff).toBeVisible({ timeout: 30_000 });
  await expect(diff).toContainText("Start the post");
  await expect(diff).toContainText("Finish the post");
  await expect(diff.getByRole("row").filter({ hasText: "Added" })).toHaveCount(3);
  await expect(diff).not.toContainText("builtin.");
  await diff.screenshot({ path: path.join(webRoot, "test-results", `chat-${info.project.name}-graph-diff-table.png`) });

  await expect(dock(page)).not.toContainText("could not be read here");
});
