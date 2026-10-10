import { describe, expect, it } from "vitest";
import { runtimeAttemptStory } from "..";

const base = { attemptId: "call.1:type.1", nodeId: "type-query", definitionId: "web.type", status: "succeeded", startedAt: 10, finishedAt: 20 };
const texts = (attempt: unknown, options = {}) => runtimeAttemptStory(attempt, options).map((line) => line.text);
const lifecycle = (event: string, disposition: Record<string, unknown>, completionCheck = "true") =>
  ({ event, handlerId: "handler.consent", occurrence: "o.1", conditionEvidence: [{ truth: "true", capturedAt: 1 }], disposition, completionCheck });
/** No internal code or snake_case word reaches a line. */
const plain = (lines: string[]) => lines.forEach((line) => expect(line).not.toMatch(/[a-z]+_[a-z]+|executor\.|web\./u));

describe("lifecycle story lines (C11)", () => {
  it("names a Call Subflow step's part and leaves the called-Flow line to Call Flow", () => {
    const call = { ...base, attemptId: "call.1", subflowTarget: { subflowId: "part.search", graphFlowId: "flow.sub", graphRevision: 2 }, childTrace: { status: "succeeded", attempts: [{}] } };
    expect(texts(call)).toEqual(["Ran the part “part.search”; its steps are listed under this one."]);
    expect(texts(call, { partName: () => "Search the catalog" })).toEqual(["Ran the part Search the catalog; its steps are listed under this one."]);
  });

  it("says where a frame began, by its entry kind, and keeps the Flow's own usual start quiet", () => {
    expect(texts({ ...base, parentAttemptId: "call.1", entry: { kind: "entry", id: "entry.search", evidence: [] } })).toEqual(["Started at “type-query”: the page already showed what this way in needs."]);
    expect(texts({ ...base, entry: { kind: "checkpoint", id: "type-query", evidence: [] } }, { stepName: () => "Type the query" })).toEqual(["Started at Type the query: a handler sent the run back to this checkpoint."]);
    expect(texts({ ...base, parentAttemptId: "call.1", entry: { kind: "default", evidence: [] } })).toEqual(["Started at “type-query”: the part's usual start."]);
    expect(texts({ ...base, entry: { kind: "default", evidence: [] } })).toEqual([]);
  });

  it("says which handler ran, when and why, and how it ended, from the decided disposition", () => {
    const named = { handlerName: () => "a cookie banner covers the page", stepName: (id: string) => (id === "search-box" ? "Search box" : undefined) };
    expect(texts({ ...base, lifecycle: lifecycle("before", { kind: "resume" }) }, named)).toEqual(["Before a step, the handler for a cookie banner covers the page ran. It dealt with it, and the run carried on."]);
    expect(texts({ ...base, lifecycle: lifecycle("fail", { kind: "route", checkpointId: "search-box" }) }, named)).toEqual(["When the step failed, the handler for a cookie banner covers the page ran. Went back to Search box."]);
    expect(texts({ ...base, lifecycle: lifecycle("retry", { kind: "resolve" }) })).toEqual(["Before trying the step again, the handler for “handler.consent” ran. Used the other way: the run went on with what the handler produced."]);
    expect(texts({ ...base, lifecycle: lifecycle("before_next", { kind: "unhandled" }, "false") })).toEqual(["Before the next step, the handler for “handler.consent” ran. It did not settle it: its check found the situation still there."]);
    expect(texts({ ...base, lifecycle: lifecycle("start", { kind: "unhandled" }, "unknown") })).toEqual(["When the part started, the handler for “handler.consent” ran. It did not settle it: its check could not tell whether the situation was gone."]);
    expect(texts({ ...base, lifecycle: { event: "before" } })).toEqual([]);
  });

  it("tells a true failure from a planned fail and an uncertain act, and leaves the rest to their own records", () => {
    expect(texts({ ...base, status: "failed", failureClass: "true_failure" })).toEqual(["A true failure: nothing in the Flow took the run past this step."]);
    expect(texts({ ...base, status: "failed", metadata: { failureClass: "planned_fail" } })).toEqual(["A planned failure: the Flow's own way on for this failure took the run on."]);
    expect(texts({ ...base, status: "failed", failureClass: "uncertain" })).toEqual(["Uncertain: the step may already have gone through, and nothing settled whether it did."]);
    for (const failureClass of ["retry", "skip", "state_route", "odd"]) expect(texts({ ...base, failureClass })).toEqual([]);
  });

  it("says a notice the page put in the way was closed, by kind and never by its page words", () => {
    expect(texts({ ...base, clearedLayers: [{ kind: "consent", control: "Accept all" }] })).toEqual(["Closed a notice the page put in the way: a cookie or consent notice."]);
    const two = texts({ ...base, clearedLayers: [{ kind: "rate_limit", control: "OK" }, { kind: "strange", control: "x" }] });
    expect(two).toEqual(["Closed 2 notices the page put in the way: a slow-down notice and a notice."]);
    expect(two.join(" ")).not.toContain("OK");
  });

  it("says how an in-run repair went", () => {
    expect(texts({ ...base, repair: { unit: { kind: "node" }, outcome: "held", reason: "r" } })).toEqual(["Repaired during the run: the fix was tried and held."]);
    expect(texts({ ...base, repair: { unit: { kind: "node" }, outcome: "dropped", reason: "r" } })).toEqual(["A repair was tried during the run, failed its trial and was dropped."]);
    expect(texts({ ...base, repair: { outcome: "none" } })).toEqual([]);
  });

  it("orders the lifecycle lines after the step's own records and before how the failure was judged", () => {
    const attempt = {
      ...base,
      status: "failed",
      parentAttemptId: "call.1",
      retry: { attemptNumber: 2, maxAttempts: 3, backoffMs: 0, rung: "retry_node" },
      entry: { kind: "entry", id: "entry.search", evidence: [] },
      lifecycle: lifecycle("fail", { kind: "unhandled" }, "false"),
      clearedLayers: [{ kind: "dialog", control: "Close" }],
      failureClass: "true_failure",
      repair: { outcome: "held" },
      fault: { disposition: "retry" }
    };
    expect(runtimeAttemptStory(attempt).map((line) => line.kind)).toEqual(["retried", "entry", "handler", "cleared_layers", "failure_class", "repair", "defence"]);
    plain(texts(attempt));
  });
});
