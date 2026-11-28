// The project chat's scripted reading is bound only on the e2e fixture host (marker AND variable), exactly as
// the scripted assistant is. There, a scripted message is handed to the panel's tools (`panel.assistant`),
// or to the capability its scenario names, and any other message is answered in words. Temp directories only.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioConversationModel } from "../../../instructions/index.ts";
import { automationStudioFixtureHostChatModel } from "../chat-model-binding.ts";
import { PANEL_ASSISTANT_FIXTURE_MARKER, PANEL_ASSISTANT_FIXTURE_MARKER_FILE, PANEL_ASSISTANT_SCRIPT_ENV, PANEL_ASSISTANT_SCRIPT_FILE } from "../fixture-host-constants.ts";

const ENABLED = { [PANEL_ASSISTANT_SCRIPT_ENV]: "1" };
const fallback: AutomationStudioConversationModel = { name: "key", decide: async () => ({ reply: "the normal key binding" }) };
const EXECUTION = {} as Parameters<AutomationStudioConversationModel["decide"]>[1];

let rootDir = "";

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-scripted-chat-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

const mark = () => writeFile(path.join(rootDir, PANEL_ASSISTANT_FIXTURE_MARKER_FILE), `${PANEL_ASSISTANT_FIXTURE_MARKER}\n`, "utf8");
const script = (value: unknown) => writeFile(path.join(rootDir, PANEL_ASSISTANT_SCRIPT_FILE), JSON.stringify(value), "utf8");
const reading = (message: string) => ({ instructions: "", transcript: [], message, correction: null });

describe("automationStudioFixtureHostChatModel", () => {
  it("keeps the key-chosen model without the marker, without the variable, or without a data directory", async () => {
    expect(automationStudioFixtureHostChatModel({ rootDir, env: ENABLED, fallback })).toBe(fallback);
    await mark();
    expect(automationStudioFixtureHostChatModel({ rootDir, env: {}, fallback })).toBe(fallback);
    expect(automationStudioFixtureHostChatModel({ rootDir: undefined, env: ENABLED, fallback })).toBe(fallback);
  });

  it("on the fixture host hands a scripted message to the panel's tools, or to the capability its scenario names, and answers anything else in words", async () => {
    await mark();
    await script({ scenarios: [{ when: "rename step 2", turns: [] }, { when: "run it", turns: [], chat: "flow.run" }], otherwise: "Not scripted." });
    const model = automationStudioFixtureHostChatModel({ rootDir, env: ENABLED, fallback });
    expect(model).not.toBe(fallback);
    expect(await model.decide(reading("Rename step 2 to Pick"), EXECUTION)).toEqual({ do: "panel.assistant", with: { request: "Rename step 2 to Pick" } });
    expect(await model.decide(reading("please run it"), EXECUTION)).toEqual({ do: "flow.run", with: { request: "please run it" } });
    expect(await model.decide(reading("hello"), EXECUTION)).toEqual({ reply: "Not scripted." });
  });
});
