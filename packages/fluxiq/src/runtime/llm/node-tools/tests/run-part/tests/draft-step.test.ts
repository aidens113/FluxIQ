// Covers what a saved part's call leaves in the draft: `../../../draft-step.ts`, and the `draft`
// its answer carries (`../../../run/part.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../flow-authoring/draft/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep, automationStudioFlowBootstrapDraftStepIsWritable } from "../../../draft-step.ts";
import { AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, automationStudioLlmRunPartBundle } from "../../../run/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../index.ts";

const CALL = "builtin.control.call-subflow";

const stepOf = (over: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep => ({ id: "d1", position: 1, actionId: CALL, toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, input: { partId: "part.a", inputs: { words: "x" } }, effect: "mutate", disposition: "kept", ...over }) as unknown as AutomationStudioFlowDraftStep;

describe("a step that ran a saved part", () => {
  it("is one call step, pinned at the version that ran, with the values it was given: never the part's steps", () => {
    const step = stepOf({ ranWith: { part: { partId: "part.a", version: 3 }, inputs: { words: "x" } } });
    expect(automationStudioFlowBootstrapDraftStepIsWritable(step)).toBe(true);
    expect(automationStudioFlowBootstrapDraftNodeStep(step)).toEqual({
      description: CALL, node: CALL,
      entries: [{ key: "part", value: JSON.stringify({ partId: "part.a", version: 3 }) }, { key: "inputs", value: JSON.stringify({ words: "x" }) }]
    });
  });

  it("writes nothing when the call pinned nothing: nothing ran, so nothing is in the Flow", () => {
    expect(automationStudioFlowBootstrapDraftNodeStep(stepOf({}))).toBeUndefined();
  });

  it("a domain's own tool stays unwritable", () => {
    expect(automationStudioFlowBootstrapDraftStepIsWritable(stepOf({ toolId: "web.something" }))).toBe(false);
  });

  it("the tool's answer pins the version that ran, even when the call named none, and a refusal leaves no step", async () => {
    let refuse = false;
    const bundle = automationStudioLlmRunPartBundle<{ step: number }>({
      done: new Set(),
      port: { landed: () => undefined, run: async () => (refuse ? { refused: "part.not_at_start", message: "No." } : { runId: "r", status: "stopped", outputs: {}, classes: [], landed: [], partId: "part.a", version: 3, stoppedAt: { stepLabel: "A step", reason: "Why." } }) }
    });
    const send = async () => await bundle.implementations[AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID]!({ projectId: "p", flowId: "f", callId: "c", optionId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, value: { partId: "part.a", inputs: { words: "x" } } as JsonObject, permission: async () => ({ permitted: true as const }) } as unknown as Parameters<NonNullable<typeof bundle.implementations[string]>>[0]) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect((await send()).draft).toEqual({ actionId: CALL, effect: "mutate", ranWith: { part: { partId: "part.a", version: 3 }, inputs: { words: "x" } } });
    refuse = true;
    expect((await send()).draft).toBeUndefined();
  });
});
