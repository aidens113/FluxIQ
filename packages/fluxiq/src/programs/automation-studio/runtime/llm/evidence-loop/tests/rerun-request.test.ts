// A rerun the loop cannot carry out says so.
//
// `rerun` is the one amendment the draft does not apply, so the loop filters it
// out of the apply call and resolves it here. Until 2026-09-26 this function
// answered with the first runnable rerun or with nothing, and nothing reached
// nobody: the row read `llm_evidence_loop.draft_unchanged`, no refusal was
// recorded, and the model was asked again with no word about why its edit had
// not taken. These hold every way it declines to the refusal it now produces.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceRerunRequest } from "../rerun-request.ts";

const step = (position: number, actionId: string, toolId?: string): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId,
  ...(toolId ? { toolId } : {}),
  input: { url: "https://example.test" },
  effect: "mutate",
  disposition: "kept"
});

const steps = [step(1, "web.observe_page"), step(2, "web.output.dom-extract_list", "core.run_node")];
const offered = new Set(["web.observe_page", "core.run_node"]);
const rerun = (position: number, input?: JsonObject): AutomationStudioFlowDraftAmendment =>
  ({ step: position, change: "rerun", ...(input ? { input } : {}) });

describe("the rerun a decision asked for", () => {
  it("is the first one the loop can run, through the tool the step went through, and refuses nothing", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2, { rows: 40 })], steps, offered);

    // The keys it changed, over the argument the step ran with (`../rerun-input.ts`).
    expect(resolved.request).toEqual({ step: 2, toolId: "core.run_node", input: { url: "https://example.test", rows: 40 }, callId: "rerun.2" });
    expect(resolved.refused).toEqual([]);
  });

  it("leaves a decision's other amendments alone, refusing none of them here", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest(
      [{ step: 1, change: "exploratory" }, { step: 99, change: "drop" }],
      steps,
      offered
    );

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([]);
  });
});

describe("a rerun the loop declines", () => {
  it("names a step that is not there in the draft's own word for it, so the model is told which numbers exist", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(7, { rows: 40 })], steps, offered);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 7, reason: "no_such_step" }]);
  });

  it("carried no argument to run with", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2)], steps, offered);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 2, reason: "run_by_the_loop" }]);
  });

  it("names a step whose action the loop is not offering", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2, { rows: 40 })], steps, new Set(["web.observe_page"]));

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 2, reason: "run_by_the_loop" }]);
  });

  it("is the second of two in one decision, because a decision is one call and a rerun is a call", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2, { rows: 40 }), rerun(1, { url: "https://other.test" })], steps, offered);

    expect(resolved.request?.step).toBe(2);
    expect(resolved.refused).toEqual([{ step: 1, reason: "run_by_the_loop" }]);
  });

  it("is refused once per rerun, so a decision of four declined reruns produces four refusals", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(11), rerun(12), rerun(13), rerun(14)], steps, offered);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([
      { step: 11, reason: "no_such_step" },
      { step: 12, reason: "no_such_step" },
      { step: 13, reason: "no_such_step" },
      { step: 14, reason: "no_such_step" }
    ]);
  });
});
