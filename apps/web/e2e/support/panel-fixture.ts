// What the new panel's browser specs share: signing in on the fixture host, the seeded project and Flows, the
// assistant dock, and the script the fixture host's scripted assistant replays (see e2e/README.md, "Panel specs").
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import type { PanelFixture, UiFixtureManifest } from "./app-fixture";

/** The file in the fixture directory the scripted assistant reads: Core's `PANEL_ASSISTANT_SCRIPT_FILE`. */
const SCRIPT_FILE = "e2e-assistant-script.json";

/** The seeded panel data, or a plain error that says to seed again. */
export function panelFixtureOf(manifest: UiFixtureManifest): PanelFixture {
  if (!manifest.panel) throw new Error("The fixture manifest has no panel data. Seed again: pnpm --filter @fluxiq/web fixture:e2e");
  return manifest.panel;
}

/** Signs in as the fixture's person and lands on the panel's Home, with its main navigation showing. */
export async function signInToPanel(page: Page, manifest: UiFixtureManifest): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    timeout: 30_000,
    data: {
      username: process.env.FLUXIQ_E2E_USERNAME ?? manifest.credentials.username,
      password: process.env.FLUXIQ_E2E_PASSWORD ?? manifest.credentials.password
    }
  });
  expect(response.ok(), `fixture login failed (${response.status()}): ${await response.text()}`).toBe(true);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 30_000 });
}

export const assistantDock = (page: Page) => page.getByRole("complementary", { name: "Assistant" });

/** On a wide screen the dock is already beside the page; on a phone it opens from the round button. */
export async function openAssistantDock(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Open the assistant" });
  if (await button.isVisible()) await button.click();
  await expect(assistantDock(page)).toBeVisible();
}

/** Types a message to the assistant and sends it. */
export async function sendToAssistant(page: Page, text: string): Promise<void> {
  await openAssistantDock(page);
  const box = assistantDock(page).getByRole("textbox", { name: "Message to FluxIQ" });
  await expect(box).toBeEnabled({ timeout: 30_000 });
  await box.fill(text);
  await assistantDock(page).getByRole("button", { name: "Send", exact: true }).click();
}

/** One scenario of the scripted assistant: the words the message holds, and what the model does in order. */
export type AssistantScenario = { when: string; turns: Array<Record<string, unknown>> };

/**
 * Writes the script the scripted assistant replays (the server must run with FLUXIQ_E2E_SCRIPTED_ASSISTANT=1). It
 * reads the file at every decision, so a spec writes it just before it types. A call waiting on Allow goes first in
 * its scenario; `{ $answer: "revision" }` as a value reads from what the previous tool answered.
 */
export async function writeAssistantScript(manifest: UiFixtureManifest, scenarios: AssistantScenario[], after = "Done."): Promise<void> {
  await writeFile(path.join(manifest.root, SCRIPT_FILE), `${JSON.stringify({ scenarios, after }, null, 2)}\n`, "utf8");
}
