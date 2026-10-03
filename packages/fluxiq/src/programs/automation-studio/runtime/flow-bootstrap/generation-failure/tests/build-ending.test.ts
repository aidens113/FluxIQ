// The two endings of a build that could not finish (t208): each carries a
// message the person reads, and reads back through the one parse its producer
// shares -- beside its own code and never beside any other.
import { describe, expect, it } from "vitest";
import {
  flowBootstrapBuildEndingFailure,
  flowBootstrapPhaseFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  parseAutomationStudioFlowBootstrapGenerationError,
  type AutomationStudioFlowBootstrapBuildEnding
} from "../index.ts";

const PROGRESS = { trace: [], accounting: { iterations: 12, toolCalls: 12, evidenceBytes: 400, inputTokens: 9_000, outputTokens: 900, totalTokens: 9_900, estimatedCostUsd: 0.02 } };
const ACCOUNTING = { requestId: "evidence.ending", estimatedInputTokens: 9_000, inputTokens: 9_000, outputTokens: 900, totalTokens: 9_900, estimatedCostUsd: 0.1 };

const NOT_DOABLE: AutomationStudioFlowBootstrapBuildEnding = {
  kind: "not_doable",
  message: "I could not build this Flow, and I found no way to: 1 of the 2 things you asked could not be done: \"save the kettle to my saved items\": nothing I tried did it.",
  notDone: [{ id: "a2", quote: "save the kettle to my saved items", todo: "no_step_added" }],
  tried: { rounds: 2, decisions: 76, stepsInFlow: 3, tested: "replayed_clean" }
};

const BUDGET: AutomationStudioFlowBootstrapBuildEnding = {
  kind: "budget_exhausted",
  message: "The build stopped at its spending limit of $0.25 before the Flow was finished.",
  bound: "cost",
  notDone: [],
  tried: { rounds: 1, decisions: 40, stepsInFlow: 1, tested: "not_tested" }
};

describe("the ending of a build that could not finish", () => {
  it.each([["not doable", NOT_DOABLE, "flow_bootstrap.not_doable", false], ["a budget hit", BUDGET, "flow_bootstrap.evidence_budget_exhausted", true]] as const)(
    "publishes %s under its own code, with the person's message, and reads back whole",
    (_label, ending, code, retryable) => {
      const error = flowBootstrapBuildEndingFailure(ending, PROGRESS, ACCOUNTING, { revision: 1, steps: 3 }, ["bootstrap.instructed_act_missing"]);
      expect(error.diagnostic).toMatchObject({ code, stage: "provider_output_validation", retryable, ending, issueCodes: ["bootstrap.instructed_act_missing"], evidenceLoop: { incompleteDraft: { revision: 1, steps: 3 } } });
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(error.diagnostic)).toEqual(error.diagnostic);
      expect(parseAutomationStudioFlowBootstrapGenerationError(error)).toEqual(error.diagnostic);
    }
  );

  it("is refused beside any other code, and its code is refused without it", () => {
    const { diagnostic } = flowBootstrapBuildEndingFailure(NOT_DOABLE, PROGRESS, ACCOUNTING);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, code: "flow_bootstrap.evidence_iteration_limit" })).toBeNull();
    const { ending: _ending, ...without } = diagnostic;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(without)).toBeNull();
    // A not-doable ending cannot be published under the budget's code, nor the other way round.
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, code: "flow_bootstrap.evidence_budget_exhausted", retryable: true })).toBeNull();
  });

  it("refuses a message it could not show whole, or one with control characters, and a budget ending that names no budget", () => {
    const { diagnostic } = flowBootstrapBuildEndingFailure(BUDGET, PROGRESS, ACCOUNTING);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: { ...BUDGET, message: "x".repeat(1_001) } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: { ...BUDGET, message: "stopped\u0000" } })).toBeNull();
    const { bound: _bound, ...unbounded } = BUDGET;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: unbounded })).toBeNull();
  });

  // Live run muqk713g: each round's stop and the no-route case read back whole, in closed words only.
  it("reads back each round's stop and the no-route case, and refuses any word outside them", () => {
    const tried = { ...NOT_DOABLE.tried, stops: [{ round: 0, stopped: "iterations" as const }, { round: 1, stopped: "repeat_without_progress" as const }], noRoute: { kind: "repeated_unchanged" as const } };
    const { diagnostic } = flowBootstrapBuildEndingFailure({ ...NOT_DOABLE, tried }, PROGRESS, ACCOUNTING);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)?.ending?.tried).toEqual(tried);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: { ...NOT_DOABLE, tried: { ...tried, stops: [{ round: 0, stopped: "gave up because the page said so" }] } } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: { ...NOT_DOABLE, tried: { ...tried, stops: [{ round: 0, stopped: "iterations", why: "x" }] } } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: { ...NOT_DOABLE, tried: { ...tried, noRoute: { kind: "no_progress", before: {} } } } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, ending: { ...NOT_DOABLE, tried: { ...tried, stops: Array.from({ length: 7 }, (_, round) => ({ round, stopped: "iterations" })) } } })).toBeNull();
    // A budget ending has no no-route case: only "not doable" is reached by one.
    const budget = flowBootstrapBuildEndingFailure({ ...BUDGET, tried: { ...BUDGET.tried, stops: [{ round: 0, stopped: "budget" }] } }, PROGRESS, ACCOUNTING).diagnostic;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(budget)).toEqual(budget);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...budget, ending: { ...BUDGET, tried: { ...BUDGET.tried, noRoute: { kind: "no_progress" } } } })).toBeNull();
  });

  it("cannot be written by a phase failure, which has no message to give", () => {
    for (const code of ["flow_bootstrap.not_doable", "flow_bootstrap.evidence_budget_exhausted"] as const) {
      const { diagnostic } = flowBootstrapPhaseFailure("provider_output_validation", ACCOUNTING, code);
      expect(diagnostic.code).toBe("flow_bootstrap.provider_output_validation_failed");
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
    }
  });
});
