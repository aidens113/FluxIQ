import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import type { AutomationStudioFlowBootstrapEvidenceTraceRow } from "../evidence-loop-steps.ts";
import { automationStudioFlowBootstrapLargestSizeLimits } from "../plan/index.ts";
import {
  automationStudioFlowBootstrapEvidenceSteps,
  parseAutomationStudioFlowBootstrapEvidenceSteps
} from "../evidence-loop-steps.ts";

/**
 * The most draft positions a published step may represent: the largest Flow
 * the Flow size setting allows, one appended step per iteration, and the
 * iteration-zero observation. A published step is read with no Flow in hand.
 */
const MAX_REPRESENTED = automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1;

function amendRow(row: Partial<AutomationStudioFlowBootstrapEvidenceTraceRow> = {}): AutomationStudioFlowBootstrapEvidenceTraceRow {
  return { iteration: 3, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_unchanged", amended: 0, ...row };
}

describe("Flow Bootstrap evidence steps: refused amendments", () => {
  // The loop's trace has carried these since t140 and a step dropped them, so
  // seven decisions that applied nothing published one word between them.
  it("carries every refused amendment out of the trace row onto the step", () => {
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      amendmentsRefused: [{ step: 9, reason: "no_such_step" }, { step: 1, reason: "already_so" }]
    })]);
    expect(step).toEqual({
      toolId: "core.decision_amend_draft",
      iteration: 3,
      resultCode: "llm_evidence_loop.draft_unchanged",
      amended: 0,
      amendmentsRefused: [{ step: 9, reason: "no_such_step" }, { step: 1, reason: "already_so" }],
      // The same refusals as flat `step:reason` codes, for a reader that keeps
      // only a list of strings.
      amendmentRefusals: ["9:no_such_step", "1:already_so"]
    });
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  it("names the refused step's node in both forms when the trace knows it", () => {
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      amendmentsRefused: [{ step: 2, reason: "already_so", nodeId: "demo.look" }]
    })]);
    expect(step).toMatchObject({
      amendmentsRefused: [{ step: 2, reason: "already_so", nodeId: "demo.look" }],
      amendmentRefusals: ["2:already_so:demo.look"]
    });
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  it("leaves the field off a decision that refused nothing", () => {
    for (const refused of [undefined, [] as const]) {
      const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow({ amended: 2, ...(refused ? { amendmentsRefused: refused } : {}) })]);
      expect(step).not.toHaveProperty("amendmentsRefused");
      expect(step).not.toHaveProperty("amendmentRefusals");
    }
  });

  // The step number is the model's own -- a refusal reading `no_such_step` is
  // exactly the case where it named one that is not there -- so it is bounded,
  // and the reason must be one the draft actually has.
  it("leaves behind a refusal whose step or reason does not fit, and keeps the rest", () => {
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      amendmentsRefused: [
        { step: 10_000, reason: "no_such_step" },
        { step: -1, reason: "already_so" },
        { step: 2.5, reason: "already_so" },
        { step: 4, reason: "whatever_the_model_said" as never },
        { step: 7, reason: "not_a_kept_step" }
      ]
    })]);
    expect(step?.amendmentsRefused).toEqual([{ step: 7, reason: "not_a_kept_step" }]);
    expect(step?.amendmentRefusals).toEqual(["7:not_a_kept_step"]);
  });

  it("publishes at most the refusals one decision can carry", () => {
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      amendmentsRefused: Array.from({ length: 20 }, (_item, index) => ({ step: index + 1, reason: "already_so" as const }))
    })]);
    expect(step?.amendmentsRefused).toHaveLength(16);
  });

  // A step carrying a field the allow-list does not name takes the whole
  // diagnostic down rather than arriving short, so the read back is checked
  // field for field against what is published.
  it.each([
    ["an unknown reason", [{ step: 1, reason: "made_up" }]],
    ["a step past the bound", [{ step: 10_000, reason: "already_so" }]],
    ["a field the refusal does not have", [{ step: 1, reason: "already_so", why: "prose" }]],
    ["nothing at all", []],
    ["more than one decision can carry", Array.from({ length: 17 }, () => ({ step: 1, reason: "already_so" }))],
    ["something that is not a refusal", ["already_so"]]
  ])("refuses a stored step whose refusals are %s", (_name, amendmentsRefused) => {
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([{
      toolId: "core.decision_amend_draft",
      iteration: 3,
      amendmentsRefused
    }])).toBeNull();
  });

  it("parses back a step written before the field existed", () => {
    const stored = { toolId: "core.decision_amend_draft", iteration: 3, amended: 1 };
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([stored])).toEqual([stored]);
  });
});

describe("Flow Bootstrap evidence steps: content-free progress", () => {
  const instrumentation = {
    progress: { draftRevisionBefore: 2, draftRevisionAfter: 3, pageState: "unchanged", draftState: "changed", answerabilityState: "changed" } as const,
    draftChange: { targetedStepIds: ["f1", "d2"], appliedCount: 1, refusedCount: 1, keptStepCount: 2, rerunStepId: "d2" },
    draft: { bytes: 512, budget: 4_096, steps: 2, instructionBytes: 128, unlisted: 1, withoutInput: 1, inputTooLarge: 1, overBudget: true as const, budgetBelowFloor: true as const },
    answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: true }
  };

  it("publishes and parses every bounded member without provider or page content", () => {
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow(instrumentation)]);

    expect(step).toMatchObject(instrumentation);
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  it("keeps the largest supported seeded-and-appended draft in sanitized and stored evidence", () => {
    const boundary = {
      ...instrumentation,
      draftChange: { ...instrumentation.draftChange, keptStepCount: MAX_REPRESENTED },
      draft: { ...instrumentation.draft, steps: MAX_REPRESENTED, unlisted: 0, withoutInput: 0, inputTooLarge: 0 }
    };
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow(boundary)]);

    expect(step).toMatchObject(boundary);
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  // A Flow is no longer capped at sixty-four nodes (`model/flow-size/`): a
  // draft of a hundred or a hundred and fifty steps is an ordinary build of a
  // Flow whose setting allows it, and its published steps must read back.
  it.each([100, 150])("keeps a %i-step draft in sanitized and stored evidence", (steps) => {
    const large = {
      ...instrumentation,
      draftChange: { ...instrumentation.draftChange, keptStepCount: steps },
      draft: { ...instrumentation.draft, steps, unlisted: 0, withoutInput: 0, inputTooLarge: 0 }
    };
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow(large)]);

    expect(step).toMatchObject(large);
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  it("drops and refuses represented draft counts above the supported seed-plus-append maximum", () => {
    const aboveBoundary = {
      ...instrumentation,
      draftChange: { ...instrumentation.draftChange, keptStepCount: MAX_REPRESENTED + 1 },
      draft: { ...instrumentation.draft, steps: MAX_REPRESENTED + 1, unlisted: 0, withoutInput: 0, inputTooLarge: 0 }
    };
    const [sanitized] = automationStudioFlowBootstrapEvidenceSteps([amendRow(aboveBoundary)]);

    expect(sanitized).not.toHaveProperty("draftChange");
    expect(sanitized).not.toHaveProperty("draft");
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([{
      toolId: "core.decision_amend_draft",
      draftChange: aboveBoundary.draftChange
    }])).toBeNull();
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([{
      toolId: "core.decision_amend_draft",
      draft: aboveBoundary.draft
    }])).toBeNull();
  });

  it("bounds the combined listed and unlisted draft count at the represented maximum", () => {
    const [boundary] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      draft: { ...instrumentation.draft, steps: 64, unlisted: MAX_REPRESENTED - 64, withoutInput: 0, inputTooLarge: 0 }
    })]);
    const [aboveBoundary] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      draft: { ...instrumentation.draft, steps: 64, unlisted: MAX_REPRESENTED - 63, withoutInput: 0, inputTooLarge: 0 }
    })]);

    expect(boundary?.draft).toMatchObject({ steps: 64, unlisted: MAX_REPRESENTED - 64 });
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([boundary])).toEqual([boundary]);
    expect(aboveBoundary).not.toHaveProperty("draft");
  });

  it.each([
    ["progress prose", { progress: { ...instrumentation.progress, pageState: "page changed to private value" } }],
    ["progress extra key", { progress: { ...instrumentation.progress, detail: "private" } }],
    ["unsafe step id", { draftChange: { ...instrumentation.draftChange, targetedStepIds: ["private step id"] } }],
    ["duplicate targeted ids", { draftChange: { ...instrumentation.draftChange, targetedStepIds: ["d2", "d2"] } }],
    ["too many targeted ids", { draftChange: { ...instrumentation.draftChange, targetedStepIds: Array.from({ length: 17 }, (_, index) => `d${index}`) } }],
    ["inconsistent draft counts", { draft: { ...instrumentation.draft, withoutInput: 3 } }],
    ["nonliteral draft flag", { draft: { ...instrumentation.draft, overBudget: false } }],
    ["answerability prose", { answerability: { ...instrumentation.answerability, issueCode: "private prose" } }],
    ["answerability extra key", { answerability: { ...instrumentation.answerability, instruction: "private" } }]
  ])("rejects a stored step carrying %s", (_name, override) => {
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([{
      toolId: "core.decision_amend_draft",
      ...override
    }])).toBeNull();
  });

  it("still parses a step written before progress instrumentation existed", () => {
    const old = { toolId: "core.decision_complete", iteration: 1 };

    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([old])).toEqual([old]);
  });

  // The start step the completion check put back: a draft position and a closed word, and nothing else.
  it("publishes and reads back which withdrawn step the completion check restored, and refuses anything else there", () => {
    const [published] = automationStudioFlowBootstrapEvidenceSteps([{ iteration: 5, decision: "complete", restoredStep: { step: 2, withdrawnAs: "exploratory" } }]);
    expect(published).toMatchObject({ restoredStep: { step: 2, withdrawnAs: "exploratory" } });
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([published])).toEqual([published]);
    for (const restoredStep of [{ step: 0, withdrawnAs: "dropped" }, { step: 2, withdrawnAs: "kept" }, { step: 2, withdrawnAs: "dropped", url: "https://x" }]) {
      expect(parseAutomationStudioFlowBootstrapEvidenceSteps([{ ...published, restoredStep }])).toBeNull();
    }
  });
});
