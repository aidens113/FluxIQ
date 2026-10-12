import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioCandidateTrialFeedback, automationStudioCandidateTrialLandedActs } from "../index.ts";

// t462: the lasting acts a trial left on the site, numbered as the trial's feedback numbers its steps.

const press = (id: string, words: string, consequences?: unknown[]) => ({
  id, definitionId: "web.output.dom-click", label: `Press ${id}`,
  parameterValues: { target: { selector: `#${id}` }, element: { tagName: "button", visibleText: words } },
  ...(consequences ? { metadata: { declaredConsequences: consequences } } : {})
});

const graph = {
  nodes: [
    { id: "open", definitionId: "web.output.browser-navigate", parameterValues: { url: "http://shop.test/" } },
    { id: "loop", definitionId: "builtin.control.for-each", parameterValues: {} },
    press("add", "Add  item", ["create_new"]),
    press("pay", "Pay now", ["create_new", "move_money", "create_new"]),
    press("look", "Look", []),
    press("odd", "Odd", ["purchase"]),
    press("plain", "Plain")
  ]
} as unknown as AutomationStudioFlowArtifact;

let next = 0;
function attempt(nodeId: string, status: "succeeded" | "failed", extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  const definitionId = (graph.nodes as Array<{ id: string; definitionId: string }>).find((node) => node.id === nodeId)!.definitionId;
  return { attemptId: `a${++next}`, nodeId, definitionId, startedAt: next, status, inputs: {}, outputs: {}, effects: [], ...extra };
}
const trace = (attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioGraphExecutionTrace => ({ status: "failed", startedAt: 1, values: {}, effects: [], attempts });
const busy: NonNullable<AutomationStudioNodeAttemptTrace["failure"]> = { category: "action_failed", code: "press.busy", retryable: true, stage: "execution", effect: "unacted" };

describe("the lasting acts a trial landed", () => {
  it("counts a succeeded step that declared a lasting class, numbered as the feedback numbers it with retries folded and loop passes", () => {
    const run = trace([
      attempt("open", "succeeded"),
      attempt("loop", "succeeded", { route: "body", outputs: { item: { name: "one" } } }),
      attempt("add", "failed", { failure: busy }),
      attempt("add", "succeeded"),
      attempt("loop", "succeeded", { route: "body", outputs: { item: { name: "two" } } }),
      attempt("add", "succeeded"),
      attempt("loop", "succeeded", { route: "done" }),
      attempt("pay", "succeeded")
    ]);
    const acts = automationStudioCandidateTrialLandedActs(run, graph);
    expect(acts).toEqual([
      { step: 3, definitionId: "web.output.dom-click", label: "Press add", control: "Add item", consequences: ["create_new"] },
      { step: 5, definitionId: "web.output.dom-click", label: "Press add", control: "Add item", consequences: ["create_new"] },
      // Core's order, each once.
      { step: 7, definitionId: "web.output.dom-click", label: "Press pay", control: "Pay now", consequences: ["move_money", "create_new"] }
    ]);
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", trace: run, graph });
    const listed = feedback.steps as JsonObject[];
    for (const act of acts) expect(listed[act.step - 1]).toMatchObject({ step: act.step, definitionId: act.definitionId, label: act.label, control: act.control, status: "succeeded" });
  });

  it("leaves out a failed, state-held or skipped step, and one that declared nothing lasting or no class Core knows", () => {
    const acts = automationStudioCandidateTrialLandedActs(trace([
      attempt("add", "failed", { failure: { category: "action_failed", code: "press.refused", retryable: false } }),
      attempt("pay", "failed", { stateHeld: { rung: "skip_satisfied_node", route: "success" }, failure: busy }),
      attempt("add", "succeeded", { skipped: { reason: "target_absent", code: "web.target.absent" } }),
      attempt("look", "succeeded"),
      attempt("odd", "succeeded"),
      attempt("plain", "succeeded")
    ]), graph);
    expect(acts).toEqual([]);
  });

  it("numbers every step, past the 40 the feedback lists", () => {
    const attempts = [...Array.from({ length: 45 }, () => attempt("open", "succeeded")), attempt("add", "succeeded")];
    expect(automationStudioCandidateTrialLandedActs(trace(attempts), graph)).toEqual([expect.objectContaining({ step: 46 })]);
  });

  it("answers nothing without a trace or a graph", () => {
    expect(automationStudioCandidateTrialLandedActs(undefined, graph)).toEqual([]);
    expect(automationStudioCandidateTrialLandedActs(trace([attempt("add", "succeeded")]), undefined)).toEqual([]);
  });
});
