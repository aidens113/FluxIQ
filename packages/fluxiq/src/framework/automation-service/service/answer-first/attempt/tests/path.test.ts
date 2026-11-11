// The path an attempt reports after its saved Flow broke and the first round got the result
// (`../path.ts`): a repair exactly when every step of the Flow as it ends ran in this attempt.
// Plain draft steps, no service: a lending library's nodes, none of the Lab's realistic scenarios.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "../../flow-run/index.ts";
import { automationStudioAnswerFirstPathAtEnding } from "../path.ts";

const READ = "domain.library.read_loans";
const RENEW = "domain.library.renew_card";
type Step = AutomationStudioFlowDraftStep;

const step = (position: number, id: string, node: string, over: Partial<Step> = {}): Step => ({ position, id, iteration: position, actionId: node, toolId: "core.run_node", input: { node }, effect: node === READ ? "observe" : "mutate", disposition: "kept", proposes: true, ...over });
const saved = (): Step[] => [step(1, "d1", READ), step(2, "d2", RENEW), step(3, "d3", RENEW)];

/** The saved Flow broke at step 2: the read passed, and step 3 was never reached. */
const broken: AutomationStudioAnswerFirstFlowRunOutcome = {
  kind: "ran", reachedEnd: false,
  steps: [{ position: 1, ran: "passed" }, { position: 2, ran: "failed" }, { position: 3, ran: "not_reached" }],
  failing: { position: 2, happened: "The step's control was not found on the page." }
};

function pathOf(steps: Step[], forwardPassed: readonly string[] = [], over: { path?: "run_flow_then_repair" | "run_flow_then_explore" } = {}) {
  return automationStudioAnswerFirstPathAtEnding({ flowRun: { outcome: broken, wentOut: true }, decidedAfterRun: true, path: over.path ?? "run_flow_then_repair", startedWith: saved(), steps, forwardPassed: new Set(forwardPassed) }, "achieved");
}

const dropped = (each: Step): Step => ({ ...each, disposition: "dropped" });

describe("a saved Flow that broke, then a result in the first round", () => {
  it("is a repair where the broken step was done again by hand in its place and the rest run forward", () => {
    expect(pathOf([step(1, "d1", READ), step(2, "d4", RENEW, { standsFor: "d2" }), step(3, "d3", RENEW), dropped(step(4, "d2", RENEW))], ["d3"])).toBe("run_flow_then_repair");
  });

  it("is a repair where the hand fix was the last step of the Flow", () => {
    const steps = [step(1, "d1", READ), step(2, "d4", RENEW, { standsFor: "d2" }), dropped(step(3, "d3", RENEW)), dropped(step(4, "d2", RENEW))];
    expect(pathOf(steps)).toBe("run_flow_then_repair");
  });

  it("is a repair where a forward run passed the written fix and everything after it", () => {
    expect(pathOf([step(1, "d1", READ), step(2, "d4", RENEW, { written: true }), step(3, "d3", RENEW), dropped(step(4, "d2", RENEW))], ["d4", "d3"])).toBe("run_flow_then_repair");
  });

  it("is an exploration where the broken step still stands in the Flow", () => {
    expect(pathOf([...saved(), step(4, "d4", RENEW)], ["d3"])).toBe("run_flow_then_explore");
  });

  it("is an exploration where a saved step after the fix never ran", () => {
    expect(pathOf([step(1, "d1", READ), step(2, "d4", RENEW, { standsFor: "d2" }), step(3, "d3", RENEW), dropped(step(4, "d2", RENEW))])).toBe("run_flow_then_explore");
  });

  it("is an exploration where the fix was written and never run", () => {
    expect(pathOf([step(1, "d1", READ), step(2, "d4", RENEW, { written: true }), step(3, "d3", RENEW), dropped(step(4, "d2", RENEW))], ["d3"])).toBe("run_flow_then_explore");
  });

  it("is an exploration where the whole run went through, its judge gave no yes, and nothing in the Flow changed after it", () => {
    const whole: AutomationStudioAnswerFirstFlowRunOutcome = { kind: "ran", reachedEnd: true, steps: saved().map((each) => ({ position: each.position, ran: "passed" as const })) };
    const path = automationStudioAnswerFirstPathAtEnding({ flowRun: { outcome: whole, wentOut: true }, decidedAfterRun: true, path: "run_flow_then_repair", startedWith: saved(), steps: saved(), forwardPassed: new Set() }, "achieved");
    expect(path).toBe("run_flow_then_explore");
    // A forward run over the same Flow after the judge's no is the Flow worked on live, as the read it repaired was (`../../flow-run/tests/repaired-read-conditions.test.ts`).
    const forward = automationStudioAnswerFirstPathAtEnding({ flowRun: { outcome: whole, wentOut: true }, decidedAfterRun: true, path: "run_flow_then_repair", startedWith: saved(), steps: saved(), forwardPassed: new Set(["d1", "d2", "d3"]) }, "achieved");
    expect(forward).toBe("run_flow_then_repair");
  });

  it("is an exploration after a fresh round, however the Flow ends", () => {
    expect(pathOf([step(1, "d1", READ), step(2, "d4", RENEW, { standsFor: "d2" }), dropped(step(3, "d3", RENEW)), dropped(step(4, "d2", RENEW))], [], { path: "run_flow_then_explore" })).toBe("run_flow_then_explore");
  });
});
