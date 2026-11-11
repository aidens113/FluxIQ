// What a FluxNode run hands its attempt to keep for a person's press (W3, t899): the overrides frame it set, and
// never a secret input, which travels beside the run (`runtime/run-secrets/`) and so is not among the kept options.
import { fluxNodeSpecSchema, resolveFluxNodeOptions, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstCallerOptionsRead, automationStudioAnswerFirstKeptCallerOptions } from "../../answer-first/caller/index.ts";
import { fluxNodeCallerOptions } from "../caller-options.ts";
import { fluxNodeRunOverridesFrame } from "../overrides-frame.ts";

const spec: FluxNodeSpec = fluxNodeSpecSchema.parse({ name: "library.sign-in", runtime: "library", start: "library://account", goal: "Sign in with {password}.", inputs: { type: "object", properties: { card: { type: "string" }, password: { type: "string", format: "secret" } }, required: ["card", "password"] }, scope: { acts: [] } });
const resolved = { prompts: { "core.efficiency": { mode: "append" as const, text: "Prefer fewer steps." } }, judgeCriteria: [], tools: {}, models: {}, deadlines: {}, retryWaits: {}, pace: { minStepGapMs: 5 } };

describe("the options a FluxNode run hands its attempt", () => {
  it("carry the run's frame, which is what a press on the attempt sets, and no secret input", () => {
    const frame = fluxNodeRunOverridesFrame(resolved, 6, "d".repeat(64));
    const options = fluxNodeCallerOptions({
      spec, specHash: "a".repeat(64), runId: "fnr-1", inputs: { card: "c-1" }, bridge: undefined, personAsk: { raised: () => undefined },
      options: { ...resolveFluxNodeOptions(spec.options, undefined), retries: 6 }, runOverrides: frame
    });
    expect(options.runOverrides).toEqual({ nodeAttempts: 7, prompts: resolved.prompts, pace: { minStepGapMs: 5 }, digest: "d".repeat(64) });
    const kept = JSON.parse(JSON.stringify(automationStudioAnswerFirstKeptCallerOptions(options))) as Record<string, unknown>;
    expect(automationStudioAnswerFirstCallerOptionsRead(kept).runOverrides).toEqual(frame);
    // The secret was never in the options, so nothing a press reads can hold it.
    expect(JSON.stringify(kept)).not.toContain("hunter2");
    expect(options.inputs).toEqual({ card: "c-1" });
  });

  it("carry no frame where the run set none", () => {
    const options = fluxNodeCallerOptions({ spec, specHash: "a".repeat(64), runId: "fnr-1", inputs: {}, bridge: undefined, personAsk: { raised: () => undefined }, options: resolveFluxNodeOptions(spec.options, undefined) });
    expect("runOverrides" in options).toBe(false);
  });
});
