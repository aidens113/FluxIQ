// The scripted model is bound only on the e2e fixture host: the marker in the data directory AND the
// variable. Every other combination keeps the normal key binding. Temp directories only.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssistantModelSource } from "../../types.ts";
import { PANEL_ASSISTANT_FIXTURE_MARKER, PANEL_ASSISTANT_FIXTURE_MARKER_FILE, PANEL_ASSISTANT_SCRIPT_ENV, PANEL_ASSISTANT_SCRIPT_FILE } from "../fixture-host-constants.ts";
import { panelAssistantFixtureHostModelSource } from "../fixture-host-model-source.ts";

const CALLER = { userId: "user.ada", sessionId: "session.ada" };
const SIGNAL = new AbortController().signal;
const ENABLED = { [PANEL_ASSISTANT_SCRIPT_ENV]: "1" };
const fallback: PanelAssistantModelSource = async () => ({ ok: false, reason: "the normal key binding" });

let rootDir = "";

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-scripted-assistant-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

const mark = () => writeFile(path.join(rootDir, PANEL_ASSISTANT_FIXTURE_MARKER_FILE), `${PANEL_ASSISTANT_FIXTURE_MARKER}\n`, "utf8");

describe("panelAssistantFixtureHostModelSource", () => {
  it("is refused without the fixture marker, even with the variable set", async () => {
    const source = panelAssistantFixtureHostModelSource({ rootDir, env: ENABLED, fallback });
    expect(source).toBe(fallback);
    expect(await source(CALLER)).toEqual({ ok: false, reason: "the normal key binding" });
  });

  it("is refused with a marker file that holds anything else", async () => {
    await writeFile(path.join(rootDir, PANEL_ASSISTANT_FIXTURE_MARKER_FILE), "not-the-marker\n", "utf8");
    expect(panelAssistantFixtureHostModelSource({ rootDir, env: ENABLED, fallback })).toBe(fallback);
  });

  it("is refused without the variable, even on the fixture host", async () => {
    await mark();
    expect(panelAssistantFixtureHostModelSource({ rootDir, env: {}, fallback })).toBe(fallback);
    expect(panelAssistantFixtureHostModelSource({ rootDir, env: { [PANEL_ASSISTANT_SCRIPT_ENV]: "0" }, fallback })).toBe(fallback);
  });

  it("is refused when the engine has no data directory", () => {
    expect(panelAssistantFixtureHostModelSource({ rootDir: undefined, env: ENABLED, fallback })).toBe(fallback);
  });

  it("answers from the script in the data directory on the fixture host with the variable set", async () => {
    await mark();
    await writeFile(path.join(rootDir, PANEL_ASSISTANT_SCRIPT_FILE), JSON.stringify({ scenarios: [{ when: "greet", turns: [{ reply: "Hello there." }] }] }), "utf8");
    const choice = await panelAssistantFixtureHostModelSource({ rootDir, env: ENABLED, fallback })(CALLER);
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    const asked = await choice.model.decide({ instructions: "x", transcript: [{ author: "person", text: "please greet me" }] }, { signal: SIGNAL, caller: CALLER });
    expect(asked).toEqual({ decision: { reply: "Hello there." }, costUsd: 0 });
  });

  it("says in plain words when the script file is missing", async () => {
    await mark();
    const choice = await panelAssistantFixtureHostModelSource({ rootDir, env: ENABLED, fallback })(CALLER);
    if (!choice.ok) throw new Error("expected a model");
    await expect(choice.model.decide({ instructions: "x", transcript: [{ author: "person", text: "hi" }] }, { signal: SIGNAL, caller: CALLER })).rejects.toThrow(/could not read its script/u);
  });
});
