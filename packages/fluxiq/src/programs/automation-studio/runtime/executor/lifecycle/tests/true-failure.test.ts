import { describe, expect, it } from "vitest";
import { classifyAutomationStudioFailure, type AutomationStudioOnFailPath } from "../true-failure.ts";

const failedEdge: AutomationStudioOnFailPath = { kind: "edge", edgeId: "e-failed", targetNodeId: "fallback", deliberateStop: false };
const stopEdge: AutomationStudioOnFailPath = { kind: "edge", edgeId: "e-stop", targetNodeId: "end-failed", deliberateStop: true };

describe("what counts as a true failure", () => {
  it("is outcome uncertain when a lasting act may have landed, whatever else holds", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: true, movedBy: "retry", onFail: [failedEdge] })).toBe("outcome_uncertain");
  });

  it("is a superseded retry when another attempt is permitted", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, movedBy: "retry", onFail: [] })).toBe("retry_superseded");
    expect(classifyAutomationStudioFailure({ uncertainAct: false, movedBy: "on_retry", onFail: [] })).toBe("retry_superseded");
  });

  it("is a skip when the state already held, the act landed, or an optional step was passed", () => {
    for (const movedBy of ["satisfied", "effect_landed", "optional_way_on"] as const) {
      expect(classifyAutomationStudioFailure({ uncertainAct: false, movedBy, onFail: [] })).toBe("skip");
    }
  });

  it("is a state route when state routing moved the run", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, movedBy: "state_route", onFail: [] })).toBe("state_route");
  });

  it("is a planned fail when an authored failed edge leads to another node", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [failedEdge] })).toBe("planned_fail");
  });

  it("is a deliberate stop when the failed edge leads to an authored failed End", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [stopEdge] })).toBe("deliberate_stop");
  });

  it("is a planned fail when an On Fail handler resolved, routed or resumed", () => {
    for (const outcome of ["route", "resolve", "resume"] as const) {
      expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [{ kind: "handler", handlerId: "h", when: "true", outcome }] })).toBe("planned_fail");
    }
  });

  it("waits for an applicable On Fail handler that has not run", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [{ kind: "handler", handlerId: "h", when: "true" }] })).toBe("on_fail_pending");
  });

  it("is a true failure with no On Fail path at any scope", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [] })).toBe("true_failure");
  });

  it("is a true failure when no handler's when is true: unknown and false do not apply", () => {
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [{ kind: "handler", handlerId: "a", when: "unknown" }, { kind: "handler", handlerId: "b", when: "false" }] })).toBe("true_failure");
  });

  it("is a true failure when every handler that ran ended unhandled, failed, or left its completion check not true", () => {
    const tried: AutomationStudioOnFailPath[] = [
      { kind: "handler", handlerId: "a", when: "true", outcome: "unhandled" },
      { kind: "handler", handlerId: "b", when: "true", outcome: "body_failed" },
      { kind: "handler", handlerId: "c", when: "true", outcome: "completion_not_true" }
    ];
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: tried })).toBe("true_failure");
    // An authored path after them still makes it planned.
    expect(classifyAutomationStudioFailure({ uncertainAct: false, onFail: [...tried, failedEdge] })).toBe("planned_fail");
  });
});
