import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES,
  automationStudioRuntimePatchRefusalIsCheckableByExploration,
  decideAutomationStudioRuntimePatchRequest
} from "../diagnosis-chain.ts";

// Fix 4, second half: diagnosis and patch were two independent calls, so a
// failed or malformed diagnosis still billed a second `runtime_patch` call.
describe("decideAutomationStudioRuntimePatchRequest", () => {
  it("requests a patch only after a diagnosis that succeeded and returned a diagnosis", () => {
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: true, kind: "diagnosis" }))).toMatchObject({ request: true });
  });

  it("requests no patch when the diagnosis call failed", () => {
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: false, kind: "diagnosis" }))).toMatchObject({ request: false });
  });

  it("requests no patch when the diagnosis returned something else, or nothing", () => {
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: true, kind: "instruction_suggestion" }))).toMatchObject({ request: false });
    expect(decideAutomationStudioRuntimePatchRequest(diagnosis({ ok: true }))).toMatchObject({ request: false });
    expect(decideAutomationStudioRuntimePatchRequest(undefined)).toMatchObject({ request: false });
  });
});

// Which refusals the loop pays to look at, and which it lets stand. The cost of
// getting this wrong runs both ways: too narrow and a claim about a page is
// never checked against the page, which is live run `run-muesyox4-930bef98`;
// too wide and every dead end buys an exploration and a second diagnosis that
// could not change the answer.
describe("automationStudioRuntimePatchRefusalIsCheckableByExploration", () => {
  it("checks a goal the model said was gone, because only the page can settle that", () => {
    expect(automationStudioRuntimePatchRefusalIsCheckableByExploration({
      request: false, reason: "gone", code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.goal_unachievable, rung: "plan"
    })).toBe(true);
  });

  it("lets every other refusal stand, because no page speaks to any of them", () => {
    const others = Object.values(AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES)
      .filter((code) => code !== AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.goal_unachievable);
    for (const code of others) {
      expect(automationStudioRuntimePatchRefusalIsCheckableByExploration({ request: false, reason: "no", code, rung: "plan" }), code).toBe(false);
    }
  });

  it("is not a refusal at all when a patch was asked for, so nothing is re-planned", () => {
    expect(automationStudioRuntimePatchRefusalIsCheckableByExploration({ request: true, reason: "yes" })).toBe(false);
  });
});

function diagnosis(input: { ok: boolean; kind?: "diagnosis" | "instruction_suggestion" }): AutomationStudioLlmTaskResult {
  const response = input.kind === "diagnosis"
    ? { kind: "diagnosis" as const, summary: "The action target no longer resolves." }
    : input.kind === "instruction_suggestion"
      ? { kind: "instruction_suggestion" as const, summary: "Write it down.", instructions: [{ title: "Use stable targets", body: "Prefer stable handles." }] }
      : undefined;
  return {
    ok: input.ok,
    request: {} as AutomationStudioLlmTaskResult["request"],
    ...(response ? { response } : {}),
    diagnostics: [],
    intervention: {} as AutomationStudioLlmTaskResult["intervention"]
  };
}
