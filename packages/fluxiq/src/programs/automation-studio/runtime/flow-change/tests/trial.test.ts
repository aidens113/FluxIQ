import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, type AutomationStudioGraphExecutionOptions, type AutomationStudioNodeAttemptTrace, type AutomationStudioTransitionComparison } from "../../executor/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import { trialAutomationStudioFlowChange, type AutomationStudioFlowChangeTrialRequest } from "../index.ts";

// One trial of one change: the candidate runs from the node the change starts
// at, and what it proved is the flow-change verdict over the attempts it made.
// Every case here reads the verdict the trial returns, never a second opinion.

type FixtureNode = Pick<AutomationStudioFlowNode, "id" | "definitionId"> & { parameterValues?: JsonObject };

function flowOf(nodes: FixtureNode[], edges: Array<[string, string, string?]> = []): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.trial",
    ownerKind: "routine",
    ownerId: "routine.trial",
    name: "Trial Flow",
    createdAt: 1,
    updatedAt: 1,
    nodes: nodes.map((node) => ({ ...node })),
    edges: edges.map(([source, target, port]) => ({ id: `${source}.${target}`, sourceNodeId: source, sourcePortId: port ?? "success", targetNodeId: target, targetPortId: "in" }))
  };
}

const END: FixtureNode = { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } };
const FAIL_END: FixtureNode = { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "failed" } };

function constant(id: string, parameterValues: JsonObject = {}): FixtureNode {
  return { id, definitionId: "builtin.data.constant", parameterValues: { value: "ok", ...parameterValues } };
}

function trial(overrides: Partial<AutomationStudioFlowChangeTrialRequest> & Pick<AutomationStudioFlowChangeTrialRequest, "candidate">) {
  return trialAutomationStudioFlowChange({ changedNodeIds: ["changed"], seedValues: {}, options: {}, ...overrides });
}

function evaluatingHost(evaluate: (context: { attemptId?: string }) => AutomationNodeExpectationEvaluation): { hostRuntime: AutomationStudioHostRuntimeBoundary; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    hostRuntime: {
      capabilities: ["state-snapshot"],
      expectationEvaluator: (_conditions, _mode, _timeoutMs, context) => {
        asked.push(context.attemptId ?? "");
        return evaluate(context);
      }
    }
  };
}

describe("trialAutomationStudioFlowChange", () => {
  // D-5: the whole-run rule recorded a correct repair as rejected whenever
  // anything after it failed. The change is judged at its own nodes.
  it("verifies a change whose own evidence holds, although a later unrelated node fails", async () => {
    const result = await trial({
      candidate: flowOf([constant("changed", { expectedOutputs: { value: "ok" } }), constant("next"), FAIL_END], [["changed", "next"], ["next", "end"]])
    });

    expect(result.savedTrace.status).toBe("failed");
    expect(result.verdict).toMatchObject({ outcome: "verified", basis: ["expected_outputs"], resumeFrom: { nodeId: "next", route: "success" } });
    expect(result.verdict.checks).toContainEqual({ kind: "continuation", status: "passed", nodeId: "changed" });
  });

  it("contradicts a change whose own node fails", async () => {
    const result = await trial({
      candidate: flowOf([{ id: "changed", definitionId: "unknown.definition" }, END], [["changed", "end"]])
    });

    expect(result.verdict.outcome).toBe("contradicted");
    expect(result.verdict.checks).toContainEqual({ kind: "changed_node_succeeded", status: "failed", nodeId: "changed", code: "changed_node_failed" });
  });

  it("reports a node that merely succeeded as unverifiable", async () => {
    const result = await trial({ candidate: flowOf([constant("changed"), END], [["changed", "end"]]) });

    expect(result.verdict).toMatchObject({ outcome: "unverifiable", basis: [] });
    expect(result.verdict).not.toHaveProperty("resumeFrom");
  });

  it("starts at the graph's start when no start node is named, and at the named node otherwise", async () => {
    const candidate = flowOf([constant("first"), constant("changed", { expectedOutputs: { value: "ok" } }), END], [["first", "changed"], ["changed", "end"]]);

    const fromStart = await trial({ candidate, options: { startNodeId: "end" } });
    const fromChanged = await trial({ candidate, startNodeId: "changed" });

    expect(fromStart.executedTrace.attempts.map((attempt) => attempt.nodeId)).toEqual(["first", "changed", "end"]);
    expect(fromChanged.executedTrace.attempts.map((attempt) => attempt.nodeId)).toEqual(["changed", "end"]);
    expect(fromChanged.verdict).toMatchObject({ outcome: "verified", resumeFrom: { nodeId: "end", route: "success" } });
  });

  it("resumes nowhere when the changed node finished the run", async () => {
    const result = await trial({ candidate: flowOf([constant("changed", { expectedOutputs: { value: "ok" } })]) });

    expect(result.savedTrace.status).toBe("succeeded");
    expect(result.verdict).toMatchObject({ outcome: "verified", resumeFrom: { completed: true } });
  });

  it("says a trial that never reached a changed node was not executed", async () => {
    const result = await trial({ candidate: flowOf([constant("first"), END], [["first", "end"]]) });

    expect(result.verdict.outcome).toBe("not_executed");
    expect(result.verdict.reason).toContain("changed_nodes_not_reached");
  });

  // D-6: the trial is also the run's continuation, so it takes the budget it
  // is given rather than a fixed 50 steps.
  it("is bounded by the step budget in its options, and by nothing smaller", async () => {
    const chain = Array.from({ length: 60 }, (_, index) => constant(`step.${index}`));
    const candidate = flowOf([constant("changed", { expectedOutputs: { value: "ok" } }), ...chain, END], [
      ["changed", "step.0"],
      ...chain.slice(1).map((node, index): [string, string] => [`step.${index}`, node.id]),
      ["step.59", "end"]
    ]);

    const unbounded = await trial({ candidate, startNodeId: "changed" });
    const bounded = await trial({ candidate, startNodeId: "changed", options: { maxSteps: 7 } });

    expect(unbounded.savedTrace.status).toBe("succeeded");
    expect(unbounded.executedTrace.attempts).toHaveLength(62);
    expect(bounded.executedTrace.attempts).toHaveLength(7);
    expect(bounded.savedTrace.message).toBe("Maximum step count exceeded: 7.");
    // Stopping short proves nothing against the change.
    expect(bounded.verdict).toMatchObject({ outcome: "verified", resumeFrom: { nodeId: "step.0" } });
  });

  describe("an expected state", () => {
    const candidate = () => flowOf([constant("changed", { expectedState: { conditions: [{ kind: "text", text: "Saved" }] } }), END], [["changed", "end"]]);

    it("is evidence only when the host evaluated it and it held", async () => {
      const host = evaluatingHost(() => ({ passed: true, checkedConditionCount: 1 }));
      const result = await trial({ candidate: candidate(), options: { hostRuntime: host.hostRuntime } });

      expect(host.asked).toEqual(["changed.attempt.1"]);
      expect(result.verdict).toMatchObject({ outcome: "verified", basis: ["expected_state"] });
    });

    it("contradicts the change when the host rejects it", async () => {
      const host = evaluatingHost(() => ({ passed: false, message: "Not saved." }));
      const result = await trial({ candidate: candidate(), options: { hostRuntime: host.hostRuntime } });

      expect(result.verdict.outcome).toBe("contradicted");
      expect(result.verdict.checks).toContainEqual({ kind: "expected_state", status: "failed", nodeId: "changed", code: "expected_state_rejected" });
    });

    it.each([
      ["no host can evaluate it", undefined],
      ["the host's evaluator throws", evaluatingHost(() => { throw new Error("host unavailable"); }).hostRuntime]
    ])("is unknown, never a pass, when %s", async (_label, hostRuntime) => {
      const result = await trial({ candidate: candidate(), options: hostRuntime ? { hostRuntime } : {} });

      expect(result.verdict.outcome).toBe("unverifiable");
      expect(result.verdict.checks).toContainEqual({ kind: "expected_state", status: "unknown", nodeId: "changed", code: "expected_state_unevaluated" });
    });

    it("leaves every other member of the host runtime as it was", async () => {
      const captured: string[] = [];
      class Host implements AutomationStudioHostRuntimeBoundary {
        readonly #points: string[];
        readonly capabilities = ["state-snapshot"];
        constructor(points: string[]) { this.#points = points; }
        captureStateSnapshot(input: { attemptId: string; point: string }) {
          this.#points.push(`${input.attemptId}:${input.point}`);
          return { stateSnapshotId: `state.${this.#points.length}`, stateRef: `ref.${this.#points.length}`, capturedAt: 1 };
        }
        expectationEvaluator(): AutomationNodeExpectationEvaluation { return { passed: true }; }
      }
      const result = await trial({ candidate: candidate(), options: { hostRuntime: new Host(captured) } });

      expect(captured).toContain("changed.attempt.1:before_action");
      expect(result.verdict).toMatchObject({ outcome: "verified", basis: ["expected_state"] });
    });
  });

  describe("a downstream assertion", () => {
    const verifiesState = (node: AutomationStudioFlowNode) => node.id === "assert";

    it("verifies the change when a later verification node succeeds", async () => {
      const result = await trial({ candidate: flowOf([constant("changed"), constant("assert"), END], [["changed", "assert"], ["assert", "end"]]), verifiesState });

      expect(result.verdict).toMatchObject({ outcome: "verified", basis: ["downstream_assertion"] });
    });

    it("contradicts the change when a later verification node fails", async () => {
      const result = await trial({
        candidate: flowOf([constant("changed"), { id: "assert", definitionId: "unknown.assert" }, END], [["changed", "assert"], ["assert", "end"]]),
        verifiesState
      });

      expect(result.verdict.outcome).toBe("contradicted");
      expect(result.verdict.checks).toContainEqual({ kind: "downstream_assertion", status: "failed", nodeId: "assert", code: "downstream_assertion_failed" });
    });

    it("counts nothing a node was not declared to verify", async () => {
      const result = await trial({ candidate: flowOf([constant("changed"), constant("assert"), END], [["changed", "assert"], ["assert", "end"]]) });

      expect(result.verdict.outcome).toBe("unverifiable");
    });
  });

  describe("records", () => {
    const recordOutput: JsonObject = { datasetId: "items", recordsPath: "records", writeMode: "replace", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] } };
    const candidate = () => flowOf([{ id: "changed", definitionId: "builtin.data.write-records", parameterValues: { recordOutput } }, END], [["changed", "end"]]);

    it("verify a changed node that saved rows", async () => {
      const result = await trial({ candidate: candidate(), seedValues: { records: [{ name: "a" }, { name: "b" }] } });

      expect(result.verdict).toMatchObject({ outcome: "verified", basis: ["records"] });
    });

    it("prove nothing when the changed node saved none", async () => {
      const result = await trial({ candidate: candidate(), seedValues: { records: [] } });

      expect(result.verdict.outcome).toBe("unverifiable");
      expect(result.verdict.checks).toContainEqual({ kind: "records", status: "unknown", nodeId: "changed", code: "records_none_captured" });
    });
  });

  it("uses the failed attempt's declared expectation for the node that failed, never its own failure route", async () => {
    const candidate = flowOf([constant("changed"), END], [["changed", "end"]]);
    const failedAttempt = failedAttemptFixture();
    const declared = await trial({ candidate, failedAttempt, expectedComparison: comparisonFixture({ expectedRoute: "success" }) });
    const missing = await trial({ candidate, failedAttempt, expectedComparison: comparisonFixture({ expectedOutputs: { total: 1 } }) });
    const repeated = await trial({ candidate, failedAttempt: { ...failedAttempt, route: "timeout" }, expectedComparison: comparisonFixture({ expectedRoute: "timeout" }) });
    // A domain may fail on a route of its own; the comparison's `failed` is then still only the executor's default.
    const defaulted = await trial({ candidate, failedAttempt: { ...failedAttempt, route: "not_found" }, expectedComparison: comparisonFixture({ expectedRoute: "failed" }) });

    expect(declared.verdict).toMatchObject({ outcome: "verified", basis: ["expected_route"] });
    expect(missing.verdict.checks).toContainEqual({ kind: "expected_outputs", status: "failed", nodeId: "changed", code: "expected_outputs_missing" });
    expect(repeated.verdict.outcome).toBe("unverifiable");
    expect(repeated.verdict.checks).toContainEqual({ kind: "expected_route", status: "not_applicable", nodeId: "changed", code: "expected_route_repeats_failure" });
    expect(defaulted.verdict.outcome).toBe("unverifiable");
    expect(defaulted.verdict.checks.some((check) => check.kind === "expected_route")).toBe(false);
  });

  // A change on another node answers the same failure. The outputs the failed
  // node owed are entries in the run's values, so producing them is evidence;
  // not producing them is not a contradiction, and a route never crosses nodes.
  it("holds a change on another node to the failed node's outputs only as evidence", async () => {
    const candidate = flowOf([constant("changed"), END], [["changed", "end"]]);
    const failedAttempt = { ...failedAttemptFixture(), attemptId: "other.attempt.1", nodeId: "other" };
    const elsewhere = (expected: Partial<AutomationStudioTransitionComparison["expected"]>) => {
      const comparison = comparisonFixture(expected);
      return trial({ candidate, failedAttempt, expectedComparison: { ...comparison, nodeId: "other", expected: { ...comparison.expected, nodeId: "other" } } });
    };

    expect((await elsewhere({ expectedOutputs: { value: "ok" } })).verdict).toMatchObject({ outcome: "verified", basis: ["expected_outputs"] });
    expect((await elsewhere({ expectedOutputs: { total: 1 } })).verdict.outcome).toBe("unverifiable");
    expect((await elsewhere({ expectedRoute: "success" })).verdict.outcome).toBe("unverifiable");
  });

  it("returns the origin only when it names one entry point", async () => {
    const candidate = flowOf([constant("changed"), END], [["changed", "end"]]);
    const origin = { entryPoint: "run_failure" as const, runId: "run.1", failedNodeId: "changed", failureSignature: "abc123" };

    expect((await trial({ candidate, origin })).origin).toEqual(origin);
    expect(await trial({ candidate, origin: { ...origin, pageText: "Save changes" } as never })).not.toHaveProperty("origin");
    expect(await trial({ candidate })).not.toHaveProperty("origin");
  });

  it("summarizes the failure as counts and codes, never its values", async () => {
    const secret = "account 4242-secret";
    const failedAttempt: AutomationStudioNodeAttemptTrace = {
      ...failedAttemptFixture(),
      outputs: { error: secret },
      failure: { category: "target_not_found", code: "target.not_found", retryable: true }
    };
    const expectedComparison = comparisonFixture({ expectedOutputs: { value: secret }, expectedState: { conditions: [{ text: secret }] } });
    const result = await trial({ candidate: flowOf([constant("changed"), END], [["changed", "end"]]), failedAttempt, expectedComparison });

    expect(result.observedState).toEqual({
      status: "failed",
      route: "failed",
      failureCategory: "target_not_found",
      failureCode: "target.not_found",
      comparisonStatus: "target_not_found",
      outputCount: 1,
      effectCount: 0,
      missingOutputCount: 1,
      unexpectedOutputCount: 1,
      missingEffectCount: 0,
      unexpectedEffectCount: 0,
      routeMatched: false,
      statusMatched: false
    });
    expect(result.expectedState).toEqual({ status: "succeeded", outputCount: 1, effectCount: 0, stateCheckCount: 1 });
    expect(JSON.stringify([result.observedState, result.expectedState])).not.toContain("4242");
  });

  it("returns the trace as executed in memory beside the saved one, which withholds the seed values", async () => {
    const seedValues: Record<string, JsonValue> = { secret: "s3cret-value" };
    const options: AutomationStudioGraphExecutionOptions = {};
    const result = await trial({ candidate: flowOf([constant("changed"), END], [["changed", "end"]]), seedValues, options });

    expect(result.executedTrace.values.secret).toBe("s3cret-value");
    expect(result.savedTrace.values.secret).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(JSON.stringify(result.savedTrace)).not.toContain("s3cret-value");
    expect(options).toEqual({});
  });
});

function failedAttemptFixture(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "changed.attempt.1", nodeId: "changed", definitionId: "builtin.data.constant", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [] };
}

function comparisonFixture(expected: Partial<AutomationStudioTransitionComparison["expected"]>): AutomationStudioTransitionComparison {
  return {
    comparisonId: "changed.attempt.1.comparison",
    nodeId: "changed",
    attemptId: "changed.attempt.1",
    status: "target_not_found",
    expected: { transitionId: "expected", nodeId: "changed", definitionId: "builtin.data.constant", expectedStatus: "succeeded", ...expected },
    actual: { transitionId: "actual", nodeId: "changed", definitionId: "builtin.data.constant", status: "failed", route: "failed", outputs: { error: "hidden" }, effects: [], startedAt: 1 },
    diffSummary: { missingOutputIds: ["value"], unexpectedOutputIds: ["error"], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: false, statusMatched: false, stateCheckCount: 1 }
  };
}
