// What one call may carry when its caller names no token limits, and what its
// instructions are cut to: nothing but the model's window.
//
// The user's order of 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION." Until then a call through a
// resolver that named no limits was held to 8,000 input, 2,000 output and 10,000
// total tokens, and its instructions were cut to 2,000 tokens (384 for a flow
// bootstrap, 4,000 for a repair build).

import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS } from "../../model-limits/index.ts";
import {
  AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS,
  AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS,
  resolveAutomationStudioLlmInstructions,
  resolveAutomationStudioLlmTokenLimits
} from "../index.ts";

describe("a call whose caller names no token limits", () => {
  it("gets the model's window, with the 8,000-token reply reserve as its output", () => {
    expect(AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS).toBe(1_000_000);
    expect(AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS).toBe(8_000);
    expect(AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS).toEqual({ maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 });
    expect(resolveAutomationStudioLlmTokenLimits()).toEqual({ limits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, diagnostics: [] });
    expect(resolveAutomationStudioLlmTokenLimits({}).limits).toEqual(AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS);
  });

  it("derives a limit it was not given from the ones it was, so they never contradict", () => {
    expect(resolveAutomationStudioLlmTokenLimits({ maxOutputTokens: 2_000 })).toEqual({ limits: { maxInputTokens: 998_000, maxOutputTokens: 2_000, maxTotalTokens: 1_000_000 }, diagnostics: [] });
    expect(resolveAutomationStudioLlmTokenLimits({ maxTotalTokens: 100_000 })).toEqual({ limits: { maxInputTokens: 92_000, maxOutputTokens: 8_000, maxTotalTokens: 100_000 }, diagnostics: [] });
    expect(resolveAutomationStudioLlmTokenLimits({ maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 })).toEqual({ limits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 }, diagnostics: [] });
  });
});

describe("a call's instructions", () => {
  it("are carried whole, however long, with no instruction budget", () => {
    const body = "Save every listed table to my saved items. ".repeat(5_000).trim();
    const resolved = resolveAutomationStudioLlmInstructions({
      projectId: "project.one",
      flowId: "flow.one",
      tokenBudget: 384,
      instructions: [{
        schemaVersion: "0.1",
        instructionId: "instruction.long",
        title: "Save the tables",
        body,
        scope: { kind: "flow", projectId: "project.one", flowId: "flow.one" },
        priority: 1,
        status: "active",
        requirement: "required",
        createdAt: 1,
        updatedAt: 1
      }]
    });

    expect(resolved.instructions[0]?.body).toBe(body);
    expect(resolved.instructions[0]).not.toHaveProperty("truncated");
    expect(resolved.diagnostics.some((diagnostic) => diagnostic.code === "instruction.truncated")).toBe(false);
  });
});
