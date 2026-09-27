import { describe, expect, it } from "vitest";

import type { AutomationStudioFlowBootstrapEvidenceTraceRow } from "../evidence-loop-steps.ts";
import {
  automationStudioFlowBootstrapEvidenceSteps,
  parseAutomationStudioFlowBootstrapEvidenceSteps
} from "../evidence-loop-steps.ts";

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
      amendmentsRefused: [{ step: 9, reason: "no_such_step" }, { step: 1, reason: "already_so" }]
    });
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  it("leaves the field off a decision that refused nothing", () => {
    for (const refused of [undefined, [] as const]) {
      const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow({ amended: 2, ...(refused ? { amendmentsRefused: refused } : {}) })]);
      expect(step).not.toHaveProperty("amendmentsRefused");
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
      draftChange: { ...instrumentation.draftChange, keptStepCount: 129 },
      draft: { ...instrumentation.draft, steps: 129, unlisted: 0, withoutInput: 0, inputTooLarge: 0 }
    };
    const [step] = automationStudioFlowBootstrapEvidenceSteps([amendRow(boundary)]);

    expect(step).toMatchObject(boundary);
    expect(parseAutomationStudioFlowBootstrapEvidenceSteps([step])).toEqual([step]);
  });

  it("drops and refuses represented draft counts above the supported seed-plus-append maximum", () => {
    const aboveBoundary = {
      ...instrumentation,
      draftChange: { ...instrumentation.draftChange, keptStepCount: 130 },
      draft: { ...instrumentation.draft, steps: 130, unlisted: 0, withoutInput: 0, inputTooLarge: 0 }
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

  it("bounds the combined listed and unlisted draft count at 129", () => {
    const [boundary] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      draft: { ...instrumentation.draft, steps: 64, unlisted: 65, withoutInput: 0, inputTooLarge: 0 }
    })]);
    const [aboveBoundary] = automationStudioFlowBootstrapEvidenceSteps([amendRow({
      draft: { ...instrumentation.draft, steps: 64, unlisted: 66, withoutInput: 0, inputTooLarge: 0 }
    })]);

    expect(boundary?.draft).toMatchObject({ steps: 64, unlisted: 65 });
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
});
