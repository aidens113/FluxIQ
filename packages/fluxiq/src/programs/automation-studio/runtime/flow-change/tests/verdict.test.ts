import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS,
  AUTOMATION_STUDIO_CHANGE_VERDICT_SCHEMA_VERSION,
  automationStudioChangeValidationResult,
  decideAutomationStudioChangeVerdict,
  type AutomationStudioChangeVerdict,
  type AutomationStudioChangeVerdictAttempt,
  type AutomationStudioChangeVerdictInput
} from "../index.ts";

// An override set to `undefined` removes that field, so an attempt can be
// written with no route at all.
type AttemptOverrides = { [Key in keyof AutomationStudioChangeVerdictAttempt]?: AutomationStudioChangeVerdictAttempt[Key] | undefined };

function attempt(nodeId: string, overrides: AttemptOverrides = {}): AutomationStudioChangeVerdictAttempt {
  const merged: Record<string, unknown> = { nodeId, status: "succeeded", route: "success", ...overrides };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  return merged as AutomationStudioChangeVerdictAttempt;
}

function decide(overrides: Partial<AutomationStudioChangeVerdictInput> & Pick<AutomationStudioChangeVerdictInput, "attempts">): AutomationStudioChangeVerdict {
  return decideAutomationStudioChangeVerdict({ changedNodeIds: ["node.changed"], runStatus: "succeeded", ...overrides });
}

function checkOf(verdict: AutomationStudioChangeVerdict, kind: string, nodeId?: string) {
  return verdict.checks.find((check) => check.kind === kind && (nodeId === undefined || check.nodeId === nodeId));
}

// A verdict's basis is non-empty exactly when it is verified, in canonical
// order, and only names evidence checks that passed.
function expectWellFormed(verdict: AutomationStudioChangeVerdict): void {
  expect(verdict.schemaVersion).toBe(AUTOMATION_STUDIO_CHANGE_VERDICT_SCHEMA_VERSION);
  expect(verdict.basis.length > 0).toBe(verdict.outcome === "verified");
  expect(verdict.basis).toEqual(AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS.filter((kind) => verdict.basis.includes(kind)));
  for (const kind of verdict.basis) expect(verdict.checks.some((check) => check.kind === kind && check.status === "passed")).toBe(true);
  if (verdict.outcome !== "verified") expect(verdict).not.toHaveProperty("resumeFrom");
  expect(verdict.reason.trim()).not.toBe("");
}

describe("change verdict: not executed", () => {
  it("is not_executed when the trial ran nothing", () => {
    const verdict = decide({ attempts: [] });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "not_executed", basis: [], checks: [] });
    expect(verdict.reason).toContain("trial_not_run");
  });

  it("is not_executed when the trial never reached a changed node, even if the run succeeded", () => {
    const verdict = decide({ attempts: [attempt("node.other", { verifiesState: true })] });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("not_executed");
    expect(verdict.reason).toContain("changed_nodes_not_reached");
  });

  it("names the caller's code when the trial was refused before it ran", () => {
    expect(decide({ attempts: [], notExecutedCode: "patch_not_applied" }).reason).toContain("patch_not_applied");
  });

  it("is not_executed for a change that names no node", () => {
    const verdict = decide({ changedNodeIds: [], attempts: [attempt("node.other", { expectedState: "passed" })] });
    expect(verdict.outcome).toBe("not_executed");
    expect(verdict.reason).toContain("no_changed_nodes");
  });
});

describe("change verdict: success is not evidence", () => {
  it("is unverifiable when the changed node merely succeeded", () => {
    const verdict = decide({ attempts: [attempt("node.changed")] });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "changed_node_succeeded")).toEqual({ kind: "changed_node_succeeded", status: "passed", nodeId: "node.changed" });
    expect(checkOf(verdict, "continuation")?.status).toBe("passed");
  });

  it("is contradicted when a changed node failed", () => {
    const verdict = decide({ runStatus: "failed", endNodeId: "node.changed", attempts: [attempt("node.changed", { status: "failed", route: "failed", expectedState: "unknown" })] });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "changed_node_succeeded")).toMatchObject({ status: "failed", code: "changed_node_failed" });
    expect(checkOf(verdict, "continuation")).toMatchObject({ status: "not_applicable", code: "changed_node_not_succeeded" });
  });

  it("is contradicted when any attempt of a changed node failed, even if another succeeded", () => {
    const verdict = decide({
      runStatus: "failed",
      attempts: [attempt("node.changed", { expectedState: "passed" }), attempt("node.loop"), attempt("node.changed", { status: "failed", route: "failed" })]
    });
    expect(verdict.outcome).toBe("contradicted");
  });

  it("is unverifiable when a changed node did not finish, whatever else passed", () => {
    const verdict = decide({
      changedNodeIds: ["node.changed", "node.approval"],
      runStatus: "waiting",
      endNodeId: "node.approval",
      attempts: [attempt("node.changed", { expectedState: "passed" }), attempt("node.approval", { status: "waiting", route: undefined })]
    });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "changed_node_succeeded", "node.approval")).toMatchObject({ status: "unknown", code: "changed_node_incomplete" });
  });

  it("treats a cancelled changed node as unknown, not as a contradiction", () => {
    const verdict = decide({ runStatus: "cancelled", attempts: [attempt("node.changed", { status: "cancelled", expectedState: "unknown" })] });
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "changed_node_succeeded")).toMatchObject({ status: "unknown", code: "changed_node_incomplete" });
  });
});

describe("change verdict: expected state", () => {
  it("is verified by a host-evaluated expected state", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedState: "passed" })] });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["expected_state"], resumeFrom: { completed: true } });
  });

  it("never counts an unevaluated expected state as a pass", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedState: "unknown" })] });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "expected_state")).toMatchObject({ status: "unknown", code: "expected_state_unevaluated" });
  });

  it("is unknown when one attempt passed and another could not be evaluated", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedState: "passed" }), attempt("node.changed", { expectedState: "unknown" })] });
    expect(checkOf(verdict, "expected_state")?.status).toBe("unknown");
    expect(verdict.outcome).toBe("unverifiable");
  });

  it("is contradicted by a rejected expected state", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedState: "failed" })] });
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "expected_state")).toMatchObject({ status: "failed", code: "expected_state_rejected" });
  });

  it("lets other evidence verify a change whose expected state the host could not evaluate", () => {
    const verdict = decide({
      attempts: [attempt("node.changed", { expectedState: "unknown" }), attempt("node.assert", { verifiesState: true })]
    });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["downstream_assertion"] });
  });
});

describe("change verdict: expected route", () => {
  it("is verified when the changed node took the route it declares", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { route: "found", expectedRoute: "found" }), attempt("node.next")] });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["expected_route"], resumeFrom: { nodeId: "node.next", route: "found" } });
  });

  it("reads an absent route as the executor's success route", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { route: undefined, expectedRoute: "success" }), attempt("node.next")] });
    expect(verdict).toMatchObject({ outcome: "verified", resumeFrom: { nodeId: "node.next", route: "success" } });
  });

  it("is contradicted when the changed node took another route", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { route: "empty", expectedRoute: "found" }), attempt("node.next")] });
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "expected_route")).toMatchObject({ status: "failed", code: "expected_route_not_taken" });
  });

  it("never counts the failure's own route as evidence", () => {
    const verdict = decide({
      failureRoute: "failed",
      attempts: [attempt("node.changed", { route: "failed", expectedRoute: "failed" }), attempt("node.recovery")]
    });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "expected_route")).toMatchObject({ status: "not_applicable", code: "expected_route_repeats_failure" });
  });

  it("ignores a blank declared route", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedRoute: "  " })] });
    expect(checkOf(verdict, "expected_route")).toBeUndefined();
    expect(verdict.outcome).toBe("unverifiable");
  });
});

describe("change verdict: expected outputs", () => {
  it("is verified when every declared output was produced", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedOutputIds: ["total"], outputIds: ["total", "extra"] })] });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["expected_outputs"] });
  });

  it("is contradicted when a declared output is missing", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { expectedOutputIds: ["total"], outputIds: [] })] });
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "expected_outputs")).toMatchObject({ status: "failed", code: "expected_outputs_missing" });
  });
});

describe("change verdict: records", () => {
  it("is verified when a record-saving changed node captured at least its minimum", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { records: { captured: 8, minimum: 5 } })] });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["records"] });
  });

  it("is verified by captured rows when the node declares no minimum", () => {
    expect(decide({ attempts: [attempt("node.changed", { records: { captured: 1 } })] }).outcome).toBe("verified");
  });

  it("is contradicted when an attempt captured fewer rows than its minimum", () => {
    const verdict = decide({
      attempts: [attempt("node.changed", { records: { captured: 8, minimum: 5 } }), attempt("node.changed", { records: { captured: 2, minimum: 5 } })]
    });
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "records")).toMatchObject({ status: "failed", code: "records_below_minimum" });
  });

  it("proves nothing when no rows were captured, even if the node allows none", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { records: { captured: 0, minimum: 0 } })] });
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "records")).toMatchObject({ status: "unknown", code: "records_none_captured" });
  });

  it("proves nothing from a count that is not a count", () => {
    const verdict = decide({ attempts: [attempt("node.changed", { records: { captured: Number.NaN } })] });
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "records")).toMatchObject({ status: "unknown", code: "records_count_invalid" });
  });
});

describe("change verdict: downstream assertion", () => {
  it("is verified by a later verification node that succeeded", () => {
    const verdict = decide({ attempts: [attempt("node.changed"), attempt("node.wait"), attempt("node.assert", { verifiesState: true })] });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["downstream_assertion"], resumeFrom: { nodeId: "node.wait", route: "success" } });
    expect(checkOf(verdict, "downstream_assertion")).toEqual({ kind: "downstream_assertion", status: "passed", nodeId: "node.assert" });
  });

  it("is contradicted when a later verification node fails, as when a repair clicked the wrong control", () => {
    const verdict = decide({
      runStatus: "failed",
      endNodeId: "node.assert",
      attempts: [attempt("node.changed"), attempt("node.assert", { verifiesState: true, status: "failed", route: "failed" })]
    });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "downstream_assertion")).toMatchObject({ status: "failed", code: "downstream_assertion_failed" });
  });

  it("ignores a verification node that ran before the change", () => {
    const verdict = decide({ attempts: [attempt("node.assert", { verifiesState: true }), attempt("node.changed")] });
    expect(checkOf(verdict, "downstream_assertion")).toBeUndefined();
    expect(verdict.outcome).toBe("unverifiable");
  });

  it("never lets a changed verification node vouch for itself", () => {
    const verdict = decide({ changedNodeIds: ["node.assert"], attempts: [attempt("node.assert", { verifiesState: true })] });
    expect(verdict.outcome).toBe("unverifiable");
  });

  it("counts a later assertion in a created Flow, where every node is changed", () => {
    const verdict = decide({
      changedNodeIds: ["node.open", "node.extract", "node.assert"],
      attempts: [attempt("node.open"), attempt("node.extract"), attempt("node.assert", { verifiesState: true })]
    });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["downstream_assertion"], resumeFrom: { completed: true } });
  });

  it("proves nothing from a verification node that did not finish", () => {
    const verdict = decide({
      runStatus: "waiting",
      attempts: [attempt("node.changed"), attempt("node.assert", { verifiesState: true, status: "waiting", route: undefined })]
    });
    expect(verdict.outcome).toBe("unverifiable");
    expect(checkOf(verdict, "downstream_assertion")).toMatchObject({ status: "unknown", code: "downstream_assertion_incomplete" });
  });

  it("does not count a node whose verification flag is anything but true", () => {
    const verdict = decide({ attempts: [attempt("node.changed"), attempt("node.assert", { verifiesState: false })] });
    expect(verdict.outcome).toBe("unverifiable");
  });
});

describe("change verdict: continuation", () => {
  it("does not let a later node's failure contradict a verified change", () => {
    const verdict = decide({
      runStatus: "failed",
      endNodeId: "node.later",
      attempts: [attempt("node.changed", { expectedState: "passed" }), attempt("node.later", { status: "failed", route: "failed" })]
    });
    expectWellFormed(verdict);
    expect(verdict).toMatchObject({ outcome: "verified", basis: ["expected_state"], resumeFrom: { nodeId: "node.later", route: "success" } });
    expect(checkOf(verdict, "changed_node_succeeded", "node.later")).toBeUndefined();
  });

  it("is contradicted when the changed node's route leads nowhere", () => {
    const verdict = decide({
      runStatus: "failed",
      endNodeId: "node.changed",
      attempts: [attempt("node.changed", { route: "found", expectedState: "passed" })]
    });
    expect(verdict.outcome).toBe("contradicted");
    expect(checkOf(verdict, "continuation")).toMatchObject({ status: "failed", code: "continuation_route_unwired" });
  });

  it("proves nothing about continuing when the run stopped heading elsewhere, and offers no resume point", () => {
    const verdict = decide({
      runStatus: "failed",
      endNodeId: "node.next",
      attempts: [attempt("node.changed", { expectedState: "passed" })]
    });
    expectWellFormed(verdict);
    expect(verdict.outcome).toBe("verified");
    expect(verdict).not.toHaveProperty("resumeFrom");
    expect(checkOf(verdict, "continuation")).toMatchObject({ status: "unknown", code: "continuation_incomplete" });
  });

  it("resumes after the last changed node, not the first", () => {
    const verdict = decide({
      changedNodeIds: ["node.first", "node.second"],
      attempts: [attempt("node.first", { expectedState: "passed" }), attempt("node.middle"), attempt("node.second", { route: "next" }), attempt("node.after")]
    });
    expect(verdict.resumeFrom).toEqual({ nodeId: "node.after", route: "next" });
  });

  it("offers no resume point on a verdict that proved nothing", () => {
    const verdict = decide({ attempts: [attempt("node.changed"), attempt("node.next")] });
    expect(verdict.outcome).toBe("unverifiable");
    expect(verdict).not.toHaveProperty("resumeFrom");
  });

  it("judges only the changed nodes the trial reached", () => {
    const verdict = decide({
      changedNodeIds: ["node.changed", "node.branch"],
      attempts: [attempt("node.changed", { expectedState: "passed" })]
    });
    expect(verdict.outcome).toBe("verified");
    expect(checkOf(verdict, "changed_node_succeeded", "node.branch")).toBeUndefined();
  });
});

describe("change verdict: basis", () => {
  it("lists every passed evidence kind once, in canonical order", () => {
    const verdict = decide({
      changedNodeIds: ["node.a", "node.b"],
      attempts: [
        attempt("node.a", { records: { captured: 3 }, expectedState: "passed" }),
        attempt("node.check", { verifiesState: true }),
        attempt("node.b", { expectedState: "passed", expectedOutputIds: ["value"], outputIds: ["value"] }),
        attempt("node.check", { verifiesState: true })
      ]
    });
    expectWellFormed(verdict);
    expect(verdict.basis).toEqual(["expected_state", "expected_outputs", "records", "downstream_assertion"]);
    expect(verdict.checks.filter((check) => check.kind === "downstream_assertion")).toHaveLength(1);
  });
});

describe("change validation result", () => {
  const verified = decide({ attempts: [attempt("node.changed", { expectedState: "passed" })] });
  const contradicted = decide({ attempts: [attempt("node.changed", { expectedState: "failed" })] });

  it("records a success with its basis for a verified verdict", () => {
    expect(automationStudioChangeValidationResult({ verdict: verified, runId: "run.1", checkedAt: 7, kind: "trial" })).toEqual({
      runId: "run.1",
      status: "succeeded",
      checkedAt: 7,
      kind: "trial",
      basis: ["expected_state"],
      detail: verified.reason
    });
  });

  it("records a failure without a basis for a contradicted verdict", () => {
    const result = automationStudioChangeValidationResult({ verdict: contradicted, runId: "run.2", checkedAt: 8, kind: "replay" });
    expect(result).toEqual({ runId: "run.2", status: "failed", checkedAt: 8, kind: "replay", detail: contradicted.reason });
  });

  it("records nothing for a verdict that proved nothing or never ran", () => {
    for (const verdict of [decide({ attempts: [attempt("node.changed")] }), decide({ attempts: [] })]) {
      expect(automationStudioChangeValidationResult({ verdict, runId: "run.3", checkedAt: 9, kind: "trial" })).toBeUndefined();
    }
  });

  it("records nothing for a verified verdict that names no evidence", () => {
    const malformed: AutomationStudioChangeVerdict = { ...verified, basis: [] };
    expect(automationStudioChangeValidationResult({ verdict: malformed, runId: "run.4", checkedAt: 10, kind: "trial" })).toBeUndefined();
  });

  it("copies the basis rather than sharing it", () => {
    const result = automationStudioChangeValidationResult({ verdict: verified, runId: "run.5", checkedAt: 11, kind: "trial" });
    result?.basis?.push("tampered");
    expect(verified.basis).toEqual(["expected_state"]);
  });
});
