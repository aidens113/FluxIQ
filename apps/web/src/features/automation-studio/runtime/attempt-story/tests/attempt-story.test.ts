import { describe, expect, it } from "vitest";
import { runtimeAttemptStory, runtimeRouteWords } from "..";

const base = { attemptId: "attempt.2", nodeId: "add-to-cart", definitionId: "web.click", status: "succeeded", startedAt: 10, finishedAt: 20 };
const texts = (attempt: unknown, options = {}) => runtimeAttemptStory(attempt, options).map((line) => line.text);
const kinds = (attempt: unknown) => runtimeAttemptStory(attempt).map((line) => line.kind);
/** No internal code, rung name or snake_case word reaches a main line. */
const plain = (lines: string[]) => lines.forEach((line) => expect(line).not.toMatch(/[a-z]+_[a-z]+|executor\.|web\.target/u));

describe("runtime attempt story", () => {
  it("has no lines for an attempt with no runtime records, and none for a non-attempt", () => {
    expect(runtimeAttemptStory(base)).toEqual([]);
    expect(runtimeAttemptStory({ ...base, readiness: { ceilingMs: 5000, waitedMs: 0, satisfied: true, checkedConditionCount: 2 } })).toEqual([]);
    expect(runtimeAttemptStory({ ...base, pace: { inForceMs: 2000, waitedMs: 0 } })).toEqual([]);
    for (const value of [null, undefined, "attempt", 3, []]) expect(runtimeAttemptStory(value)).toEqual([]);
  });

  describe("retried", () => {
    it("says which attempt, the wait and why, by rung", () => {
      expect(texts({ ...base, retry: { attemptNumber: 2, maxAttempts: 4, backoffMs: 1500, rung: "retry_node", previousAttemptId: "attempt.1" } }))
        .toEqual(["Attempt 2 of 4: tried the step again after waiting 1.5 seconds, because a step like this often works on a second try."]);
      expect(texts({ ...base, retry: { attemptNumber: 3, maxAttempts: 4, backoffMs: 0, rung: "await_recorded_state" } }))
        .toEqual(["Attempt 3 of 4: tried the step again straight away, because the page wasn't yet the way this step expects."]);
    });

    it("says the site asked to slow down when the failure carried its own wait", () => {
      expect(texts({ ...base, retry: { attemptNumber: 2, maxAttempts: 4, backoffMs: 4000, rung: "retry_node", hintedWaitMs: 4000 } }))
        .toEqual(["Attempt 2 of 4: tried the step again after waiting 4 seconds, because the site asked to slow down."]);
    });

    it("reads the action record's copy under metadata, and survives missing numbers", () => {
      expect(texts({ ...base, metadata: { retry: { attemptNumber: 2, maxAttempts: 3, backoffMs: 250, rung: "retry_node" } } }))
        .toEqual(["Attempt 2 of 3: tried the step again after waiting 0.25 seconds, because a step like this often works on a second try."]);
      expect(texts({ ...base, retry: { rung: "unknown_rung" } })).toEqual(["Tried the step again, because the step didn't work the first time."]);
      expect(texts({ ...base, retry: "not a record" })).toEqual([]);
    });
  });

  it("says interference was cleared before an attempt the clear-interference rung asked for", () => {
    const attempt = { ...base, retry: { attemptNumber: 2, maxAttempts: 3, backoffMs: 0, rung: "clear_interference" } };
    expect(kinds(attempt)).toEqual(["retried", "interference"]);
    expect(texts(attempt)[1]).toBe("Cleared what was in the way on the page before this attempt.");
  });

  describe("skipped", () => {
    it("says an optional step that was not there was skipped", () => {
      expect(texts({ ...base, route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } }))
        .toEqual(["Skipped “add-to-cart”: it was not shown, so the run went on without it."]);
      expect(texts({ ...base, route: "skipped", skipped: { reason: "target_absent", code: "executor.ready_state.not_shown" } }))
        .toEqual(["Skipped “add-to-cart”: the page did not show what it needs, so the run went on without it."]);
    });

    it("names a step by the caller's name when it has one", () => {
      expect(texts({ ...base, skipped: { reason: "target_absent", code: "x" } }, { stepName: (id: string) => id === "add-to-cart" ? "“Add to cart”" : undefined }))
        .toEqual(["Skipped “Add to cart”: it was not shown, so the run went on without it."]);
    });
  });

  describe("state routed", () => {
    const routed = (direction: "forward" | "backward") => ({ ...base, route: "state_routed", skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "checkout", direction } });

    it("says from which step to which, forward or back", () => {
      expect(texts({ ...routed("forward"), stateRouting: { outcome: "routed", candidates: 3, matched: 1, toNodeId: "checkout", direction: "forward" } }))
        .toEqual(["Skipped “add-to-cart”: the page is already past it. Continuing with “checkout”."]);
      expect(texts(routed("backward"))).toEqual(["Skipped “add-to-cart”: the page went back to an earlier step. Continuing with “checkout”."]);
    });

    it("says the page already shows what the step does when its effect holds, from either shape", () => {
      const expected = ["Skipped “add-to-cart”: the page already shows what it does. Continuing with “checkout”."];
      expect(texts({ ...routed("forward"), stateRouting: { outcome: "effect_holds", candidates: 0, matched: 0, toNodeId: "checkout" } })).toEqual(expected);
      expect(texts({ ...routed("forward"), stateRouting: { outcome: "effect_holds" } })).toEqual(expected);
    });

    it("says which guard stopped it, or why no way on was found", () => {
      expect(texts({ ...base, status: "failed", stateRouting: { outcome: "guard_stopped", candidates: 2, matched: 1, toNodeId: "search" } }))
        .toEqual(["Stopped going back to “search”: the run had already returned there without getting any further."]);
      expect(texts({ ...base, stateRouting: { outcome: "no_match", candidates: 4, matched: 0 } }))
        .toEqual(["Looked for where the page is in the Flow and found no matching step (compared 4 steps)."]);
      expect(texts({ ...base, stateRouting: { outcome: "no_match" } })).toEqual(["Looked for where the page is in the Flow and found no matching step."]);
      expect(texts({ ...base, stateRouting: { outcome: "unobserved", candidates: 0, matched: 0 } })).toEqual(["Could not read the page to find where the run is in the Flow."]);
      expect(texts({ ...base, stateRouting: { outcome: "no_pre_states", candidates: 0, matched: 0 } })).toEqual(["No other step recorded how the page looked, so there was nothing to compare the page with."]);
      expect(texts({ ...base, stateRouting: { outcome: "something_new" } })).toEqual([]);
    });

    it("tells a route without a skip record once, from the routing record", () => {
      expect(texts({ ...base, stateRouting: { outcome: "routed", candidates: 2, matched: 1, toNodeId: "checkout" } })).toEqual(["The page matched “checkout”, so the run went on there."]);
      expect(texts({ ...base, stateRouting: { outcome: "routed" } })).toEqual([]);
    });
  });

  describe("readiness", () => {
    it("says how long the run waited for the page to be ready", () => {
      expect(texts({ ...base, readiness: { ceilingMs: 5000, waitedMs: 1200, satisfied: true, checkedConditionCount: 2 } }))
        .toEqual(["Waited 1.2 seconds for the page to be ready for this step."]);
      expect(texts({ ...base, metadata: { readiness: { ceilingMs: 5000, waitedMs: 1000, satisfied: true, checkedConditionCount: 1 } } }))
        .toEqual(["Waited 1 second for the page to be ready for this step."]);
    });

    it("says a page that never became ready was a mark, and the step was tried anyway unless it was skipped", () => {
      expect(texts({ ...base, readiness: { ceilingMs: 5000, waitedMs: 5000, satisfied: false, checkedConditionCount: 2 } }))
        .toEqual(["Waited 5 seconds for the page to be ready for this step, but it was not, so the step was tried anyway."]);
      expect(texts({ ...base, readiness: { ceilingMs: 5000, waitedMs: 5000, satisfied: false, checkedConditionCount: 2 }, skipped: { reason: "target_absent", code: "executor.ready_state.not_shown" } }))
        .toEqual(["Waited 5 seconds for the page to be ready for this step, but it was not.", "Skipped “add-to-cart”: the page did not show what it needs, so the run went on without it."]);
      expect(texts({ ...base, readiness: { ceilingMs: 0, waitedMs: 0, satisfied: false, checkedConditionCount: 0 } })).toEqual([]);
    });
  });

  describe("pace", () => {
    it("says a start held to the step's pace, and a pace raised after the site asked to wait", () => {
      expect(texts({ ...base, pace: { inForceMs: 3000, waitedMs: 2000 } })).toEqual(["Held back 2 seconds to keep at least 3 seconds between starts of this step."]);
      expect(texts({ ...base, status: "failed", pace: { inForceMs: 0, waitedMs: 0, raisedToMs: 90_000 } }))
        .toEqual(["Slowed this step down because the site asked to: from now on at least 1.5 minutes between its starts."]);
    });

    it("tells the held wait before the attempt and the raise after it", () => {
      expect(kinds({ ...base, pace: { inForceMs: 1000, waitedMs: 500, raisedToMs: 4000 }, recoveryDecision: { candidates: [], selected: { kind: "retry_node", priority: 1, label: "Retry", reason: "r" } } }))
        .toEqual(["pace", "ladder", "pace"]);
    });
  });

  describe("ladder choice", () => {
    it("says what recovery chose, from the trace or the action record", () => {
      expect(texts({ ...base, status: "failed", recoveryDecision: { candidates: [], selected: { kind: "await_recorded_state", priority: 1, label: "Await", reason: "r", targetNodeId: "add-to-cart" } } }))
        .toEqual(["Recovery chose to wait for the page to catch up, then try the step again."]);
      expect(texts({ ...base, status: "failed", metadata: { recoverySelected: { kind: "reroute", targetNodeId: "search" } } }))
        .toEqual(["Recovery chose to take another way on, at “search”."]);
      expect(texts({ ...base, status: "failed", metadata: { recoverySelected: { kind: "a_new_kind" } } })).toEqual(["Recovery chose to try another way on."]);
    });

    it("says recovery found nothing more when it decided without a choice", () => {
      expect(texts({ ...base, status: "failed", recoveryDecision: { candidates: [] } })).toEqual(["Recovery found nothing more to try for this step."]);
    });
  });

  it("says how the failure was judged without its code", () => {
    expect(texts({ ...base, status: "failed", fault: { disposition: "retry", code: "x.y", category: "transient" } })).toEqual(["The run judged this failure safe to try again."]);
    expect(texts({ ...base, status: "failed", fault: { disposition: "refuse", actUncertain: true } })).toEqual(["Not repeating the step: it may already have gone through, and repeating it could do it twice."]);
    expect(texts({ ...base, status: "failed", fault: { disposition: "refuse" } })).toEqual(["Not repeating the step: another try wouldn't change what happened."]);
    expect(texts({ ...base, fault: { disposition: "other" } })).toEqual([]);
  });

  it("says a Call Flow step ran its child Flow, how many steps it took and how it ended", () => {
    expect(texts({ ...base, childTrace: { status: "succeeded", attempts: [{}, {}, {}], values: {}, effects: [], startedAt: 1 } })).toEqual(["Ran the Flow this step calls: 3 steps, it finished."]);
    expect(texts({ ...base, childTrace: { status: "failed", attempts: [{}] } })).toEqual(["Ran the Flow this step calls: 1 step, it failed."]);
    expect(texts({ ...base, childTrace: { status: "odd" } })).toEqual(["Ran the Flow this step calls: with no recorded ending."]);
  });

  it("orders every record the way the run did it, in plain words", () => {
    const attempt = {
      ...base,
      status: "failed",
      retry: { attemptNumber: 2, maxAttempts: 3, backoffMs: 1000, rung: "clear_interference" },
      pace: { inForceMs: 2000, waitedMs: 800, raisedToMs: 5000 },
      readiness: { ceilingMs: 3000, waitedMs: 3000, satisfied: false, checkedConditionCount: 1 },
      childTrace: { status: "succeeded", attempts: [{}] },
      stateRouting: { outcome: "no_match", candidates: 2, matched: 0 },
      fault: { disposition: "retry", code: "web.target.not_found" },
      recoveryDecision: { candidates: [], selected: { kind: "retry_node", priority: 1, label: "Retry", reason: "r" } }
    };
    expect(kinds(attempt)).toEqual(["retried", "interference", "pace", "readiness", "child_run", "state_routing", "defence", "ladder", "pace"]);
    plain(texts(attempt));
  });

  it("names the runtime's own routes in words and leaves a Flow's port name as it is", () => {
    expect(runtimeRouteWords("skipped")).toBe("Skipped");
    expect(runtimeRouteWords("state_routed")).toBe("Moved on");
    expect(runtimeRouteWords("success")).toBe("success");
    expect(runtimeRouteWords(undefined)).toBe("-");
  });
});
