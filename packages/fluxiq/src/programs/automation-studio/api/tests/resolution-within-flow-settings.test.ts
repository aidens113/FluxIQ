import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { assertFlowLlmExecutionSettings } from "../handlers/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioLlmProvider } from "../../../../runtime/llm/harness.ts";
import { automationStudioLlmResolutionWithinFlowSettings } from "../../../../runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts";
import { AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP } from "../../../../runtime/llm/flow-execution-limits/run-call-backstop.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS } from "../../../../runtime/llm/session-key-provider.ts";

// The Flow's stored `llmExecutionSettings` were saved and returned but never
// read, so a Flow configured for 48 calls was built with 64
// (`run-munnq7vz-98c3481c`). They lower the resolution; they never raise it.

const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "mock" }, runTask: async () => ({}) };
const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
/** What the host's session-key resolver returns: no call count, its own defaults. */
function sessionKeyResolution() {
  return { provider, tokenLimits: { ...defaults.tokenLimits }, timeoutMs: defaults.timeoutMs, maxEstimatedCostUsd: defaults.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd };
}
function flow(execution: unknown): JsonObject {
  return { llmExecutionSettings: execution } as JsonObject;
}

describe("a provider resolution narrowed by the Flow's own spend limits", () => {
  it("takes the Lab's saved settings from the live run: 48 calls, and the resolver's own request sizing", () => {
    const narrowed = automationStudioLlmResolutionWithinFlowSettings(sessionKeyResolution(), flow({
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxCalls: 48, timeoutMs: 25_000, maxEstimatedCostUsd: 0.25, retryCount: 0
    }));

    expect(narrowed).toEqual({ ...sessionKeyResolution(), maxCallsPerRun: 48 });
    expect(narrowed.provider).toBe(provider);
  });

  it("lowers the call count and per-call cost, and never raises either", () => {
    const narrowed = automationStudioLlmResolutionWithinFlowSettings({ ...sessionKeyResolution(), maxCallsPerRun: 10, maxEstimatedCostUsd: 0.05 }, flow({ maxCalls: 20, maxEstimatedCostUsd: 0.1 }));
    expect(narrowed).toMatchObject({ maxCallsPerRun: 10, maxEstimatedCostUsd: 0.05, maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd });

    const lowered = automationStudioLlmResolutionWithinFlowSettings(sessionKeyResolution(), flow({ maxCalls: 20, maxEstimatedCostUsd: 0.1 }));
    expect(lowered).toMatchObject({ maxCallsPerRun: 20, maxEstimatedCostUsd: 0.1 });
  });

  it.each([
    [1, 5, 1],
    [5, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD, 5],
    [5, 1, 1],
    [1, 0.05, 0.05],
    [AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD, 5, 5]
  ])("enforces API-accepted per-call cost %s against host allowance %s as %s without a provider call", (cost, host, expected) => {
    const metadata: JsonObject = {
      llmProvider: "anthropic", llmModel: "claude-sonnet-5-5",
      llmExecutionSettings: {
        tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
        maxCalls: 48, timeoutMs: 25_000, maxEstimatedCostUsd: cost, retryCount: 0
      }
    };
    expect(() => assertFlowLlmExecutionSettings(metadata)).not.toThrow();
    const runTask = vi.fn(provider.runTask);
    const resolution = { ...sessionKeyResolution(), provider: { ...provider, runTask }, maxEstimatedCostUsd: host, maxTotalEstimatedCostUsd: host };
    const narrowed = automationStudioLlmResolutionWithinFlowSettings(resolution, metadata);
    expect(narrowed).toMatchObject({ maxCallsPerRun: 48, maxEstimatedCostUsd: expected, maxTotalEstimatedCostUsd: host });
    expect(runTask).not.toHaveBeenCalled();
  });

  // A Flow saved from the web app stores 8,000 / 2,000 / 10,000 tokens and 20 s
  // by default; read as limits they would starve every panel-built Flow.
  it("leaves the resolver's token limits and timeout alone whatever the Flow stores", () => {
    const narrowed = automationStudioLlmResolutionWithinFlowSettings(sessionKeyResolution(), flow({
      tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 }, maxCalls: 30, timeoutMs: 20_000, maxEstimatedCostUsd: 0.25, retryCount: 0
    }));

    expect(narrowed).toEqual({ ...sessionKeyResolution(), maxCallsPerRun: 30 });
  });

  it("measures a per-call cost the resolution leaves out against the harness default, so it cannot widen it", () => {
    const narrowed = automationStudioLlmResolutionWithinFlowSettings({ provider }, flow({ maxCalls: 30, maxEstimatedCostUsd: 0.25 }));
    expect(narrowed).toEqual({ provider, maxCallsPerRun: 30, maxEstimatedCostUsd: 0.25 });
  });

  it("reads the web app's unset call count of 1 as no call count", () => {
    const narrowed = automationStudioLlmResolutionWithinFlowSettings(sessionKeyResolution(), flow({ maxCalls: 1 }));

    expect(narrowed).toEqual(sessionKeyResolution());
    expect(narrowed).not.toHaveProperty("maxCallsPerRun");
  });

  it.each([
    ["absent settings", {}],
    ["settings that are not an object", { llmExecutionSettings: [48] }],
    ["values outside the settings check's bounds", flow({ maxCalls: AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP + 1, maxEstimatedCostUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD + 0.01 })],
    ["values of the wrong type", flow({ maxCalls: "48", maxEstimatedCostUsd: "0.1" })]
  ])("ignores %s", (_label, metadata) => {
    expect(automationStudioLlmResolutionWithinFlowSettings(sessionKeyResolution(), metadata as JsonObject)).toEqual(sessionKeyResolution());
  });

  it("returns nothing, and a bare provider, as they came", () => {
    const settings = flow({ maxCalls: 48 });
    expect(automationStudioLlmResolutionWithinFlowSettings(undefined, settings)).toBeUndefined();
    expect(automationStudioLlmResolutionWithinFlowSettings(provider, settings)).toBe(provider);
    expect(automationStudioLlmResolutionWithinFlowSettings(sessionKeyResolution(), undefined)).toEqual(sessionKeyResolution());
  });
});
