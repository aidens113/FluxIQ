// The panel's chat in a real browser, as a person uses it, against the isolated fixture root and the threads
// `e2e/support/seed-chat-threads.mjs` wrote there (see e2e/README.md, "Chat widget"). No model call is made: the
// one typed send runs only when the panel's own model-key snapshot shows no enabled key.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { authenticate, readUiFixtureManifest, type UiFixtureManifest } from "./support/app-fixture";

type Seeded = { projectId: string; emptyProjectId: string; threads: { permission: string; choice: string; project: string } };

const webRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
const SLOW = 120_000;

let manifest: UiFixtureManifest;
let seeded: Seeded;
let enabledKeys: boolean | null = null;

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.beforeAll(async () => {
  manifest = await readUiFixtureManifest();
  seeded = JSON.parse(await readFile(path.join(fixtureRoot, "chat-threads-manifest.json"), "utf8")) as Seeded;
});

test.beforeEach(async ({ page }) => {
  page.on("response", async (response) => {
    if (!/secret-keys/u.test(response.url())) return;
    const body = await response.json().catch(() => null) as { payload?: { keys?: Array<{ enabled?: boolean }> } } | null;
    const keys = body?.payload?.keys;
    if (Array.isArray(keys)) enabledKeys = keys.some((key) => key.enabled === true);
  });
  // A dev server resets the first request after the previous page was torn down mid-request; a production one does not.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await authenticate(page, manifest);
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
      await page.waitForTimeout(1500);
    }
  }
});

const panel = (page: Page) => page.getByRole("dialog", { name: "FluxIQ conversation" });
const launcher = (page: Page) => page.locator(".chat-window-launcher");
const pinDialog = (page: Page, title: string) => page.getByRole("dialog").filter({ hasText: title });

async function openProject(page: Page, projectId: string): Promise<void> {
  await page.goto(`/programs/automation-studio?project=${projectId}`, { waitUntil: "domcontentloaded" });
  // The landing screen has a window of its own while the project is restored; wait for the workspace's.
  await expect(page.getByRole("button", { name: "Back to Projects" })).toBeVisible({ timeout: SLOW });
  await expect(launcher(page)).toBeVisible({ timeout: SLOW });
}

async function openChat(page: Page): Promise<void> {
  if (await launcher(page).getAttribute("aria-expanded") !== "true") await launcher(page).click();
  await expect(panel(page)).toBeVisible();
}

async function pickThread(page: Page, id: string): Promise<void> {
  const select = panel(page).getByRole("combobox", { name: "Thread" });
  await expect(select).toBeVisible({ timeout: 60_000 });
  await select.selectOption(id);
}

async function shot(page: Page, name: string, testInfo: { project: { name: string } }): Promise<void> {
  await page.screenshot({ path: path.join(webRoot, "test-results", `chat-${testInfo.project.name}-${name}.png`), animations: "disabled" });
}

test("D1: the launcher is on the landing screen with no project, fixed, on screen", async ({ page }, info) => {
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(launcher(page)).toBeVisible({ timeout: SLOW });
  const box = (await launcher(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(await page.locator(".chat-window").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  await page.mouse.wheel(0, 400);
  expect(await launcher(page).boundingBox()).toEqual(box);
  await shot(page, "landing-launcher", info);
});

test("V8: on the landing screen the window lists every project's threads, with no id on screen", async ({ page }, info) => {
  await page.goto("/programs/automation-studio", { waitUntil: "domcontentloaded" });
  await expect(launcher(page)).toBeVisible({ timeout: SLOW });
  await expect(launcher(page)).toHaveAttribute("data-waiting", "true", { timeout: 60_000 });
  await openChat(page);
  await expect(panel(page).getByRole("combobox", { name: "Thread" })).toBeVisible({ timeout: 30_000 });
  // V8: the thread is read with its own project though none is open.
  await pickThread(page, seeded.threads.project);
  await expect(panel(page).getByText("A better selector exists for the title.")).toBeVisible({ timeout: 60_000 });
  await shot(page, "landing-open", info);
  await expect(panel(page)).not.toContainText(seeded.projectId);
});

test("D2-D6, V1, V2, V7, T3, U2, U4, U6: the window in a project", async ({ page }, info) => {
  await openProject(page, seeded.projectId);
  // D2, D3: collapsed but still reading, so the badge lights without opening.
  await expect(launcher(page)).toHaveAttribute("data-waiting", "true", { timeout: 60_000 });
  await expect(launcher(page)).toContainText("Needs you");
  await expect(page.locator(".chat-window-badge")).toHaveText("3");
  await expect(launcher(page)).toHaveAttribute("aria-label", /3 threads are waiting on your answer/u);
  await expect(panel(page)).toBeHidden();
  expect(await page.getByRole("dialog", { name: "FluxIQ conversation", includeHidden: true }).count()).toBe(1);

  // D6: fixed, and not over the Studio's own bottom dock.
  const launcherBox = (await launcher(page).boundingBox())!;
  const dock = page.getByText("Action Preview", { exact: true }).first();
  if (await dock.isVisible().catch(() => false)) {
    const dockBox = (await dock.boundingBox())!;
    expect(launcherBox.y + launcherBox.height).toBeLessThanOrEqual(dockBox.y);
  }

  // D4: opening puts focus in the window; Escape closes and returns focus to the launcher.
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toBeFocused();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  await launcher(page).click();

  // D5: wider and narrower.
  const before = (await panel(page).boundingBox())!;
  await panel(page).getByRole("button", { name: "Make the conversation wider" }).click();
  const wider = (await panel(page).boundingBox())!;
  if ((page.viewportSize()?.width ?? 0) > 700) expect(wider.width).toBeGreaterThan(before.width);
  await panel(page).getByRole("button", { name: "Make the conversation narrower" }).click();
  expect((await panel(page).boundingBox())!.width).toBeCloseTo(before.width, 0);

  // V7, V1, V2: a real select; "(waiting on you)"; the project's name, no id.
  const select = panel(page).getByRole("combobox", { name: "Thread" });
  await expect(select).toBeVisible({ timeout: 30_000 });
  expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
  const labels = await select.locator("option").allInnerTexts();
  expect(labels.length).toBe(3);
  expect(labels.every((label) => label.includes("(waiting on you)"))).toBe(true);
  expect(await select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "")).toContain("waiting on you");
  await expect(panel(page)).not.toContainText(seeded.projectId);
  for (const id of Object.values(seeded.threads)) await expect(panel(page)).not.toContainText(id);

  // T3 on the project thread.
  await pickThread(page, seeded.threads.project);
  await expect(panel(page).getByText("FluxIQ stopped here and is waiting on your answer.")).toBeVisible();

  // U2: the panel's own record is a quiet FluxIQ line, never a person bubble.
  const record = panel(page).getByText("Opened the Runs view.");
  await expect(record).toBeVisible();
  await expect(panel(page).getByText("Please show me what the proposed change does.")).toBeVisible();
  await expect(panel(page).getByText("FluxIQ panel").first()).toBeAttached();
  expect(await record.evaluate((el) => !el.closest("[class*='bubble']"))).toBe(true);
  expect(await panel(page).getByText("Please show me what the proposed change does.").evaluate((el) => !!el.closest("[class*='bubble']"))).toBe(true);

  // U4: the graph diff reference cannot be resolved here (Core wires no attachment resolver); it says so.
  await expect(panel(page).getByText("Proposed Flow change could not be read here.")).toBeVisible();
  // U6: an adaptation reference opens the Adaptations view.
  await panel(page).locator(".chat-attachment", { hasText: "adaptation:adaptation.e2e.1" }).getByRole("button", { name: /open/iu }).click();
  await expect(page.getByText("Adaptation Inbox", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(panel(page)).toBeVisible();
  await shot(page, "adaptation-opened", info);
});

test("A1, A3, A4, A6: the permission ask, the PIN dialog, wrong then right PIN", async ({ page }, info) => {
  await openProject(page, seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.permission);
  const chat = panel(page);
  await expect(chat.getByText("FluxIQ is asking for permission.")).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByText("Allowing permits only the consequences listed here.")).toBeVisible();
  const consequences = chat.getByRole("list", { name: "Consequences requiring approval" });
  await expect(consequences).toContainText("send or publish something that others will receive or see");
  await expect(consequences).toContainText("create something new that stays");
  await expect(chat.getByText('The control is "Schedule post" (button).')).toBeVisible();
  await shot(page, "permission-ask", info);

  await chat.getByRole("button", { name: "Allow", exact: true }).click();
  const dialog = pinDialog(page, "Allow this action");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Re-enter your security PIN");
  // The close button sits on the title's row, not wrapped under the description.
  const closeBox = (await dialog.getByRole("button", { name: "Close" }).boundingBox())!;
  const titleBox = (await dialog.getByRole("heading", { name: "Allow this action" }).boundingBox())!;
  expect(Math.abs(closeBox.y - titleBox.y)).toBeLessThan(24);
  await shot(page, "pin-dialog", info);

  // Escape belongs to the dialog; the window stays.
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeVisible();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");
  if (!(await dialog.isVisible())) await chat.getByRole("button", { name: "Allow", exact: true }).click();

  // Core's answer-ask endpoint does not check the PIN of a plain permission ask (the act is gated where it runs), so a
  // wrong PIN cannot be produced by typing one here: the server's refusal is stood in for by a routed 403, to see what
  // the dialog does with a refusal. The answer is not sent to the server while it is refused.
  let refusals = 0;
  await page.route("**/answer-ask", async (route) => {
    refusals += 1;
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, code: "reauthorization_failed", error: "The security PIN was not accepted." }) });
  });
  const pin = dialog.getByLabel(/pin/iu).first();
  await pin.fill("000000");
  await dialog.getByRole("button", { name: /allow/iu }).last().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("The security PIN was not accepted.", { timeout: 30_000 });
  expect(refusals).toBe(1);
  // Behind a modal the window is out of the accessibility tree, so it is found by its class here.
  await expect(page.locator(".chat-window-panel")).toBeVisible();
  await expect(page.locator(".chat-window-panel button", { hasText: /^Allow$/u })).toBeVisible();
  await shot(page, "pin-refused", info);
  await page.unroute("**/answer-ask");

  await pin.fill(manifest.credentials.securityPin);
  await dialog.getByRole("button", { name: /allow/iu }).last().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(chat.getByRole("button", { name: "Allow", exact: true })).toBeHidden({ timeout: 30_000 });
  await shot(page, "permission-settled", info);
});

test("A1, A3, A4: a choice ask with destructive options needs the PIN; Cancel sends nothing", async ({ page }, info) => {
  await openProject(page, seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.choice);
  const chat = panel(page);
  await expect(chat.getByText("FluxIQ is asking you to choose.")).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByRole("list", { name: "Consequences requiring approval" })).toContainText("delete or remove something");
  await shot(page, "choice-ask", info);
  await chat.getByRole("button", { name: "Clear the oldest" }).click();
  const dialog = pinDialog(page, "Confirm this answer");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /cancel/iu }).click();
  await expect(dialog).toBeHidden();
  await expect(chat.getByRole("button", { name: "Clear the oldest" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Clear both" })).toBeVisible();
});

test("A2: the open ask takes words and answers", async ({ page }, info) => {
  await openProject(page, seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.project);
  const chat = panel(page);
  const answer = chat.getByRole("textbox", { name: "Your answer" });
  await expect(answer).toBeVisible({ timeout: 30_000 });
  const send = chat.getByRole("button", { name: "Send answer" });
  await expect(send).toBeDisabled();
  await answer.fill("Weekly roundup");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(chat.getByRole("textbox", { name: "Your answer" })).toBeHidden({ timeout: 30_000 });
  // A6: the settled ask keeps the chat's own sentence, not a second set of buttons.
  await expect(chat.getByText("You answered.")).toBeVisible();
  await expect(chat.getByRole("button", { name: "Send answer" })).toHaveCount(0);
  await shot(page, "open-ask-answered", info);
});

test("T3, T8: Show me scrolls the transcript, not the page", async ({ page }) => {
  await openProject(page, seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.choice);
  const chat = panel(page);
  await expect(chat.getByRole("list", { name: "Conversation with FluxIQ" })).toHaveAttribute("aria-live", "polite");
  const scroller = page.locator(".chat-window-panel .chat-scroll");
  await expect(chat.getByText("The run reached the old drafts list.")).toBeVisible({ timeout: 30_000 });
  const banner = chat.getByText("FluxIQ stopped here and is waiting on your answer.");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const pageBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  // As a person would: wheel up over the transcript until it is at the top, which also stops it following the tail.
  await scroller.hover();
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  const before = 0;
  await chat.getByRole("button", { name: "Show me" }).click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(pageBefore);
});

test("C4, C1: nothing from the conversation is kept in browser storage; a typed send stores the turn when no key is enabled", async ({ page }, info) => {
  await openProject(page, seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.project);
  const chat = panel(page);
  await expect(chat.getByText("Please show me what the proposed change does.")).toBeVisible({ timeout: 30_000 });
  const stored = async () => page.evaluate(() => JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)]));
  const words = ["Please show me what the proposed change does", "weekly post", "Weekly roundup", "Planning notes", "Cleanup run"];
  const draft = "Draft that is never sent";
  await chat.getByRole("textbox", { name: "Message to FluxIQ" }).fill(draft);
  expect(await stored()).not.toContain(draft);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(launcher(page)).toBeVisible({ timeout: SLOW });
  const after = await stored();
  for (const word of [...words, draft]) expect(after).not.toContain(word);

  // The key check passed only when the panel's own snapshot said no key is enabled.
  await page.goto("/programs/secret-keys", { waitUntil: "domcontentloaded" });
  await expect.poll(() => enabledKeys, { timeout: 60_000 }).not.toBeNull();
  test.skip(enabledKeys !== false, "A model key is enabled in the fixture root: no send is made.");
  await openProject(page, seeded.projectId);
  await openChat(page);
  await pickThread(page, seeded.threads.project);
  const text = "Typed from the browser spec";
  const input = panel(page).getByRole("textbox", { name: "Message to FluxIQ" });
  await input.fill(text);
  await input.press("Enter");
  await expect(panel(page).getByText(text)).toBeVisible({ timeout: 60_000 });
  expect(await stored()).not.toContain(text);
  await shot(page, "typed-send", info);
});

test("V4: an empty project welcomes, under the project's own name", async ({ page }, info) => {
  await openProject(page, seeded.emptyProjectId);
  await openChat(page);
  const chat = panel(page);
  await expect(chat.getByText("This is where FluxIQ talks to you")).toBeVisible({ timeout: 60_000 });
  await expect(chat.getByText("Permission before anything lasting")).toBeVisible();
  await expect(chat.getByRole("combobox", { name: "Thread" })).toHaveCount(0);
  await expect(chat.locator(".chat-window-heading")).toContainText("UI Fixture - Empty");
  await expect(chat).not.toContainText(seeded.emptyProjectId);
  await shot(page, "welcome", info);
  // No key is enabled in this root, so the key line shows; its control goes there in this tab, never a new one.
  await expect(chat.getByText("FluxIQ needs a model key before it can build.")).toBeVisible();
  const pages = page.context().pages().length;
  await chat.getByRole("button", { name: "Add a model key" }).click();
  await page.waitForURL(/\/programs\/secret-keys/u, { timeout: 60_000 });
  expect(page.context().pages()).toHaveLength(pages);
});

test("the chat alone: /programs/automation-studio/chat?projectId= works", async ({ page }, info) => {
  await page.goto(`/programs/automation-studio/chat?projectId=${seeded.projectId}`, { waitUntil: "domcontentloaded" });
  const main = page.getByRole("main", { name: "FluxIQ chat" });
  await expect(main).toBeVisible({ timeout: SLOW });
  await expect(main.getByRole("combobox", { name: "Thread" })).toBeVisible({ timeout: 60_000 });
  await expect(main.getByText("Two drafts match. Which should I clear?")).toBeVisible({ timeout: 30_000 });
  await expect(main).not.toContainText(seeded.projectId);
  await shot(page, "chat-alone", info);
  await page.goto("/programs/automation-studio/chat", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Say which project to chat about")).toBeVisible();
});
