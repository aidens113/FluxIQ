import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../../../executor/index.ts";
import { automationStudioCandidateTrialAlreadyInState, automationStudioCandidateTrialLandedActs } from "../../../index.ts";

// t775: a step the domain found already in its asked state pressed nothing. It is
// never a lasting act the trial left, and it is listed apart, with its pass and row.

const graph = {
  nodes: [
    { id: "loop", definitionId: "builtin.control.for-each", parameterValues: {} },
    { id: "flip", definitionId: "web.output.dom-click", label: "Switch the setting", parameterValues: { target: { selector: "#flip" }, element: { tagName: "button", visibleText: "Setting" } }, metadata: { declaredConsequences: ["modify_existing"] } }
  ]
} as unknown as AutomationStudioFlowArtifact;

let next = 0;
function attempt(nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  const definitionId = (graph.nodes as Array<{ id: string; definitionId: string }>).find((node) => node.id === nodeId)!.definitionId;
  return { attemptId: `a${++next}`, nodeId, definitionId, startedAt: next, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...extra };
}
const trace = (attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioGraphExecutionTrace => ({ status: "succeeded", startedAt: 1, values: {}, effects: [], attempts });
const inState = (row?: string): Partial<AutomationStudioNodeAttemptTrace> => ({ outputs: { skipped: "already_in_state" }, skipped: { reason: "already_in_state", code: "executor.act.already_in_state", ...(row ? { row } : {}) } });

describe("a trial step already in its asked state", () => {
  it("is no landed act, where the same step that pressed is one", () => {
    expect(automationStudioCandidateTrialLandedActs(trace([attempt("flip")]), graph)).toEqual([
      { step: 1, definitionId: "web.output.dom-click", label: "Switch the setting", control: "Setting", consequences: ["modify_existing"] }
    ]);
    expect(automationStudioCandidateTrialLandedActs(trace([attempt("flip", inState())]), graph)).toEqual([]);
  });

  it("is listed apart as already_in_state, numbered as the feedback numbers it, with its pass and row where known", () => {
    const run = trace([
      attempt("loop", { route: "body", outputs: { item: { name: "one" } } }),
      attempt("flip", inState("Row one")),
      attempt("loop", { route: "body", outputs: { item: { name: "two" } } }),
      attempt("flip"),
      attempt("loop", { route: "done" })
    ]);
    expect(automationStudioCandidateTrialAlreadyInState(run, graph)).toEqual([
      { step: 2, definitionId: "web.output.dom-click", label: "Switch the setting", control: "Setting", outcome: "already_in_state", pass: { number: 1, of: 2 }, row: "Row one" }
    ]);
    // The second pass pressed: that one is the act, and only it.
    expect(automationStudioCandidateTrialLandedActs(run, graph).map((act) => [act.step, act.pass])).toEqual([[4, { number: 2, of: 2 }]]);
  });

  it("lists nothing for a trial with no such step, or none at all", () => {
    expect(automationStudioCandidateTrialAlreadyInState(trace([attempt("flip"), attempt("flip", { skipped: { reason: "target_absent", code: "web.target.not_found" } })]), graph)).toEqual([]);
    expect(automationStudioCandidateTrialAlreadyInState(undefined, graph)).toEqual([]);
  });
});
