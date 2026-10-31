import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { inRunRepairRequest } from "../../../service/runtime-session/tests/in-run-repair-fixture.ts";
import { automationStudioInRunRepairHistory } from "../index.ts";

function history(fields: Partial<AutomationStudioNodeAttemptTrace> = {}) {
  const request = inRunRepairRequest();
  Object.assign(request.failedAttempt, fields);
  return automationStudioInRunRepairHistory(request);
}

describe("recorded repair observations", () => {
  it("keeps legacy history bytes, completed IDs and genuine failure codes", () => {
    const result = history();
    expect(JSON.stringify(result.recoveriesTried)).toBe(JSON.stringify([
      { attemptId: "read.attempt.4", nodeId: "read", kind: "retry", attemptNumber: 4, maxAttempts: 4, rung: "retry_node" }
    ]));
    expect(result.failedAttempt.failure?.code).toBe("test.target.not_found");
    expect(result.actsCompleted).toEqual([{ attemptId: "open.attempt.1", nodeId: "open", definitionId: "builtin.data.constant", framePath: ["frame.root"] }]);
  });

  it("copies only obstruction and pace scalars, retaining zero and fractional waits", () => {
    const result = history({
      obstruction: { kind: "rate_limit", retryAfterMs: 12.5, id: "private-layer", name: "private-page", covers: "private-target", dismiss: [{ intent: "dismiss", controlRef: { selector: "private-control" } }] },
      pace: { inForceMs: 0, waitedMs: 0.5, raisedToMs: 12.5 },
      inputs: { record: "private-record" }, outputs: { result: "private-output" }, message: "private-error"
    });
    expect(result.recoveriesTried.slice(1)).toEqual([
      { attemptId: "read.attempt.4", nodeId: "read", kind: "obstruction", obstructionKind: "rate_limit", retryAfterMs: 12.5 },
      { attemptId: "read.attempt.4", nodeId: "read", kind: "pace", inForceMs: 0, waitedMs: 0.5, raisedToMs: 12.5 }
    ]);
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(result.recoveriesTried[1]).not.toHaveProperty("code");
  });

  it.each(["row", "output"] as const)("records source-bound %s provenance without free-form diagnostics", (kind) => {
    expect(history({ reacquire: { kind, sourceNodeId: "source", outcome: "found", returned: true, reason: "private-error", at: 1 } }).recoveriesTried.at(-1)).toEqual({
      attemptId: "read.attempt.4", nodeId: "read", kind: "reacquire", strategy: kind, sourceNodeId: "source", outcome: "found", returned: true
    });
    for (const outcome of ["found", "gone", "unmatched", "unavailable"] as const) {
      expect(history({ reacquire: { kind, sourceNodeId: "source", outcome, at: 1 } }).recoveriesTried.at(-1)).toEqual({
        attemptId: "read.attempt.4", nodeId: "read", kind: "reacquire", strategy: kind, sourceNodeId: "source", outcome
      });
    }
  });

  it.each(["found", "gone", "unmatched", "unavailable"] as const)("keeps source-less identity %s without a manufactured source", (outcome) => {
    const entry = history({ reacquire: { kind: "identity", outcome, reason: "observation_incomplete", at: 2 } }).recoveriesTried.at(-1);
    expect(entry).toEqual({ attemptId: "read.attempt.4", nodeId: "read", kind: "reacquire", strategy: "identity", outcome });
    expect(entry).not.toHaveProperty("sourceNodeId");
    expect(entry).not.toHaveProperty("returned");
  });

  it("preserves state-route observations and refusal order without prose or opaque state", () => {
    const result = history({ stateRouting: {
      outcome: "routed", candidates: 3, matched: 1, direction: "backward", toNodeId: "checkpoint", closeness: 0.75, reason: "private-page",
      refused: [{ toNodeId: "hidden", nodeId: "act", guard: "repeats_lasting_act" }, { toNodeId: "hidden2", nodeId: "producer", guard: "unbound_value" }]
    } });
    expect(result.recoveriesTried[1]).toEqual({
      attemptId: "read.attempt.4", nodeId: "read", kind: "state_route", outcome: "routed", toNodeId: "checkpoint",
      refused: ["repeats_lasting_act", "unbound_value"], candidates: 3, matched: 1, direction: "backward", closeness: 0.75
    });
    expect(JSON.stringify(result)).not.toContain("private-page");
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER + 1])("omits invalid measurements %s without replacing them", (invalid) => {
    const entries = history({
      obstruction: { kind: "notice", dismiss: [], retryAfterMs: invalid },
      pace: { inForceMs: invalid, waitedMs: 0 },
      stateRouting: { outcome: "no_match", candidates: invalid, matched: invalid, closeness: invalid }
    }).recoveriesTried;
    expect(entries.map((entry) => entry.kind)).toEqual(["retry", "state_route", "obstruction"]);
    expect(entries[1]).toEqual({ attemptId: "read.attempt.4", nodeId: "read", kind: "state_route", outcome: "no_match" });
    expect(entries[2]).toEqual({ attemptId: "read.attempt.4", nodeId: "read", kind: "obstruction", obstructionKind: "notice" });
    expect(history({ pace: { inForceMs: 1, waitedMs: invalid } }).recoveriesTried).toHaveLength(1);
    expect(history({ pace: { inForceMs: 1, waitedMs: 0, raisedToMs: invalid } }).recoveriesTried.at(-1)).not.toHaveProperty("raisedToMs");
  });

  it("omits fractional counts and preserves a recorded finite closeness without inventing a scale", () => {
    const entry = history({ stateRouting: { outcome: "no_match", candidates: 1.5, matched: 0, closeness: 2 } }).recoveriesTried[1];
    expect(entry).not.toHaveProperty("candidates");
    expect(entry).toMatchObject({ matched: 0, closeness: 2 });
  });

  it("does not turn uncertain effects into completed acts or retry permission", () => {
    const result = history({ failureClass: "uncertain", effectCheck: { result: "unknown", checkedAt: 1 }, pace: { inForceMs: 1, waitedMs: 0 } });
    expect(result.failedAttempt.failureClass).toBe("uncertain");
    expect(result.recoveriesTried.map((entry) => entry.kind)).toEqual(["retry", "counted", "pace"]);
    expect(result.actsCompleted.map((entry) => entry.attemptId)).toEqual(["open.attempt.1"]);
    expect(JSON.stringify(result.recoveriesTried)).not.toContain("safe");
  });

  it("keeps legacy handler order before each attempt's appended observations", () => {
    const request = inRunRepairRequest();
    request.attempts = ["first", "second"].map<AutomationStudioNodeAttemptTrace>((handlerId, index) => ({
      ...request.failedAttempt, attemptId: `attempt.${index}`,
      lifecycle: { handlerId, event: "retry", occurrence: `event.${index}`, conditionEvidence: [], disposition: { kind: "resume" }, completionCheck: "true" },
      repair: { unit: { kind: "node", nodeId: "read" }, outcome: "none", reason: "private-error" },
      failureClass: "retry", pace: { inForceMs: 1, waitedMs: 0 }
    }));
    const result = automationStudioInRunRepairHistory(request);
    expect(result.recoveriesTried.map((entry) => entry.kind)).toEqual(["retry", "handler", "repair", "counted", "pace", "retry", "handler", "repair", "counted", "pace"]);
    expect(result.recoveriesTried.filter((entry) => entry.kind === "handler").map((entry) => entry.handlerId)).toEqual(["first", "second"]);
    expect(JSON.stringify(result)).not.toContain("private-error");
  });
});
