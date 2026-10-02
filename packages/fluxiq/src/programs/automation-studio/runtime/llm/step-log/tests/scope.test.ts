// The step log's scope: which build (creation or re-author) and which phase
// every step is written under, so a run's steps can be summed per cost ceiling.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioLlmStepLogModelStep, automationStudioLlmStepLogScope, automationStudioLlmStepLogTool } from "../index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-step-scope-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });

function modelStep(taskKind = "evidence_tool_decision") {
  return automationStudioLlmStepLogModelStep({ provider: "deepseek", model: "m", url: "https://api.example/chat", body: "{}", taskKind, requestId: `r.${Math.random()}` }, env());
}

function meta(folder: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(directory, folder, "meta.json"), "utf8")) as Record<string, unknown>;
}

describe("the part and phase a step is written under", () => {
  it("keeps the build's part when a round sets its round and phase", async () => {
    const tool = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => ({ ok: true }), env());
    await automationStudioLlmStepLogScope.within({ part: "creation" }, () =>
      automationStudioLlmStepLogScope.run({ round: 1, phase: "repair" }, async () => {
        modelStep()!.succeeded({ kind: "evidence_tool_decision" });
        await tool({ callId: "c1", toolId: "web.look" });
      }, env()), env());

    expect(meta("0001-decide")).toMatchObject({ part: "creation", round: 1, phase: "repair" });
    expect(meta("0002-tool-web.look")).toMatchObject({ part: "creation", round: 1, phase: "repair" });
    expect(automationStudioLlmStepLogScope.current()).toBeUndefined();
  });

  it("writes the instruction reading as the read phase, outside any round", () => {
    automationStudioLlmStepLogScope.within({ part: "reauthor" }, () =>
      automationStudioLlmStepLogScope.within({ phase: "read" }, () => modelStep()!.succeeded({ kind: "evidence_tool_decision" }), env()), env());
    expect(meta("0001-decide")).toMatchObject({ part: "reauthor", phase: "read", round: null });
  });

  it("writes part null, and the kind's own phase, with no scope", async () => {
    modelStep("loop_verification")!.succeeded({ kind: "loop_verification" });
    await automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => ({ ok: true }), env())({ callId: "c1", toolId: "web.look" });
    expect(meta("0001-judge")).toMatchObject({ part: null, phase: "judge", round: null });
    expect(meta("0002-tool-web.look")).toMatchObject({ part: null, phase: "explore", round: null });
  });
});

describe("a failed model step", () => {
  it("writes what the provider error says was paid", () => {
    modelStep()!.failed({ name: "AutomationStudioLlmProviderError", code: "llm.provider_malformed_response", paid: { inputTokens: 900, outputTokens: 40, cacheHitInputTokens: 300, estimatedCostUsd: 0.000512 } });
    expect(meta("0001-decide")).toMatchObject({
      status: "error", error: { code: "llm.provider_malformed_response" },
      usage: { inputTokens: 900, outputTokens: 40, cacheHitInputTokens: 300, cacheMissInputTokens: null },
      costUsd: 0.000512
    });
  });
});
