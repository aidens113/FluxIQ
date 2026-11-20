// t973: a chat attempt asked again because the last answer left a task unanswered in words climbs one
// rung up the model ladder, still with no thinking, and its step meta says from where and why. No model
// is called: the fetch is scripted.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioAnthropicModel } from "../../models/index.ts";
import { createAutomationStudioAnthropicPanelCommandModel } from "../panel-command.ts";
import { envelope, jsonReply } from "./fixtures.ts";

type Wire = { model: string; thinking?: unknown; messages: { role: string; content: string }[] };

const ANSWER = JSON.stringify({ result_json: JSON.stringify({ intent: "task", do: "flow.createHere", with: { instruction: "List every atlas." } }) });
const REQUEST = { instructions: "Answer with one JSON object.", transcript: [], message: "List every atlas.", correction: null };

function adapter(model: AutomationStudioAnthropicModel) {
  const sent: Wire[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Wire;
    sent.push(body);
    return jsonReply(envelope(ANSWER, { model: body.model }));
  });
  const chat = createAutomationStudioAnthropicPanelCommandModel({ resolveKey: async () => "dummy-provider-key", model, fetchImpl: fetchImpl as unknown as typeof fetch });
  return { chat, sent };
}

const execution = () => ({ signal: new AbortController().signal, caller: null });

describe("a chat attempt asked one rung up", () => {
  it("is sent to the next model on the ladder, with no thinking, and an ordinary attempt is not", async () => {
    const { chat, sent } = adapter("claude-haiku-5-5");
    await chat.decide(REQUEST, execution());
    await chat.decide({ ...REQUEST, correction: "You said their message is a task and answered it with a reply.", climb: { reason: "task_answered_in_words" } }, execution());
    expect(sent.map((body) => body.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    // No thinking on either, each model's own way (`../../../models/providers/anthropic/no-thinking.ts`).
    expect(sent[0]!.thinking).toEqual({ type: "disabled" });
    expect(sent[1]!.thinking).toEqual({ type: "between_tools" });
    expect(sent[1]!.messages.at(-1)).toEqual({ role: "user", content: "You said their message is a task and answered it with a reply." });
  });

  it("stays on its own model at the top of the ladder", async () => {
    const { chat, sent } = adapter("claude-opus-5-5");
    await chat.decide({ ...REQUEST, climb: { reason: "reply_undeclared" } }, execution());
    expect(sent[0]!.model).toBe("claude-opus-5-5");
  });

  it("says in its step meta which model it climbed from and why", async () => {
    const directory = mkdtempSync(join(tmpdir(), "t973-step-log-"));
    const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    try {
      const { chat } = adapter("claude-haiku-5-5");
      await chat.decide(REQUEST, execution());
      await chat.decide({ ...REQUEST, climb: { reason: "task_answered_in_words" } }, execution());
      const metas = readdirSync(directory).filter((folder) => folder.endsWith("-chat")).sort().map((folder) => JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { model: string; climb?: unknown });
      expect(metas.map((meta) => [meta.model, meta.climb])).toEqual([
        ["claude-haiku-5-5", undefined],
        ["claude-sonnet-5-5", { from: "claude-haiku-5-5", reason: "task_answered_in_words" }]
      ]);
    } finally {
      if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
      else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
