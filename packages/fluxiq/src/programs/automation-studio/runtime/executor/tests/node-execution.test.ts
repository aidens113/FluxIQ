import { describe, expect, it } from "vitest";
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../../nodes/index.ts";
import {
  runAutomationStudioGraph,
  type AutomationStudioGraphExecutionOptions,
  type AutomationStudioGraphExecutionTrace,
  type AutomationStudioRecordBatch
} from "../index.ts";

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.dispatch-failure",
  ownerKind: "task",
  ownerId: "task.dispatch-failure",
  name: "Dispatch failure",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
  edges: []
};
const matched = { status: "matched", candidateCount: 1, minimumConfidence: 0.5, candidateId: "confirm", confidence: 1 } as const;

describe("effect dispatch results in the attempt trace", () => {
  it("carries a failed dispatcher's failure record, message, and target resolution onto the attempt", async () => {
    const failure = { category: "timeout", code: "web.action.timed_out", retryable: true } as const;
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false }, message: "The client did not answer.", failure, targetResolution: matched })
    });

    expect(trace.attempts[0]).toMatchObject({ status: "failed", outputs: { ok: false }, message: "The client did not answer.", failure, targetResolution: matched });
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("timeout");
  });

  it("keeps a successful dispatcher's target resolution", async () => {
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true }, targetResolution: matched })
    });

    expect(trace.attempts[0]).toMatchObject({ status: "succeeded", targetResolution: matched });
    expect(trace.attempts[0]).not.toHaveProperty("failure");
  });

  it("leaves dispatcher results without the new fields unchanged", async () => {
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false } })
    });

    expect(trace.attempts[0]).not.toHaveProperty("failure");
    expect(trace.attempts[0]).not.toHaveProperty("targetResolution");
    expect(trace.attempts[0]).not.toHaveProperty("message");
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("action_failed");
  });
});

// Obviously synthetic: every assertion about it is where it must or must not travel.
const SUPPLIED = "synthetic-dispatch-value-that-must-never-be-persisted";
type DispatchContext = { withheldValues?: { texts: string[]; numbers: number[] } } | undefined;
const succeeded = { status: "success", route: "success", outputs: { ok: true } } as const;

describe("what an effect dispatcher is told to withhold", () => {
  it("hands the dispatcher the value the run resolved out of state, and not what the Flow authored, while the effect carries the real value", async () => {
    const calls: Array<{ payload: unknown; context: DispatchContext }> = [];
    const trace = await runAutomationStudioGraph({
      ...flow,
      flowId: "flow.bound-dispatch",
      nodes: [{ id: "type", definitionId: "builtin.policy.action", parameterValues: { outputId: "type-text", parameters: { selector: "#field", text: { $state: { path: "run.supplied.text" } } } } }]
    }, {
      inputs: { "run.supplied.text": SUPPLIED },
      effectDispatcher: (effect, context) => {
        calls.push({ payload: effect.payload, context });
        return succeeded;
      }
    });

    expect(trace.status).toBe("succeeded");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toMatchObject({ outputId: "type-text", parameters: { selector: "#field", text: SUPPLIED } });
    expect(calls[0]?.context?.withheldValues?.texts).toContain(SUPPLIED);
    expect(calls[0]?.context?.withheldValues?.texts).not.toContain("#field");
    expect(calls[0]?.context?.withheldValues?.texts).not.toContain("type-text");
  });

  it("tells a native node's dispatcher the same", async () => {
    const contexts: DispatchContext[] = [];
    await runAutomationStudioGraph({
      ...flow,
      flowId: "flow.native-bound-dispatch",
      nodes: [{ id: "native", definitionId: "importer.example.type", parameterValues: { selector: "#field", text: { $state: { path: "run.supplied.text" } } } }]
    }, {
      inputs: { "run.supplied.text": SUPPLIED },
      nativeNodeExecutor: ({ node }) => Promise.resolve({
        result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: "type-text", parameters: node.parameterValues ?? {} } }] }
      }),
      effectDispatcher: (_effect, context) => {
        contexts.push(context);
        return succeeded;
      }
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.withheldValues?.texts).toContain(SUPPLIED);
  });

  it("gives a dispatcher no context when the run withholds nothing and has no signal", async () => {
    const contexts: DispatchContext[] = [];
    await runAutomationStudioGraph(flow, {
      effectDispatcher: (_effect, context) => {
        contexts.push(context);
        return succeeded;
      }
    });

    expect(contexts).toEqual([undefined]);
  });
});

const conditions = [{ path: "cart.items", operator: "exists" }];
const expectationFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.expectation",
  ownerKind: "task",
  ownerId: "task.expectation",
  name: "Expectation",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "check", definitionId: "builtin.policy.expectation", parameterValues: { conditions, mode: "all", timeoutMs: 250 } }],
  edges: []
};

describe("the host expectation evaluator", () => {
  it("routes the expectation node to failed when the bound evaluator rejects", async () => {
    const asked: unknown[] = [];
    const trace = await runAutomationStudioGraph(expectationFlow, {
      hostRuntime: {
        capabilities: ["expectation-evaluation"],
        expectationEvaluator: (...args) => {
          asked.push(args);
          return { passed: false, message: "The cart stayed empty.", checkedConditionCount: 1 };
        }
      }
    });

    expect(trace.attempts[0]).toMatchObject({
      status: "failed",
      route: "failed",
      outputs: { passed: false, failed: true },
      message: "The cart stayed empty.",
      failure: { category: "expected_state_missing", code: "core.policy.expectation_rejected", retryable: true, stage: "verification" }
    });
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
    expect(asked).toEqual([[conditions, "all", 250, { source: "policy_node", nodeId: "check", attemptId: "check.attempt.1" }]]);
  });

  it("leaves a host that binds no evaluator exactly as it was", async () => {
    const trace = await runAutomationStudioGraph(expectationFlow, { hostRuntime: { capabilities: ["state-snapshot"] } });
    const unbound = await runAutomationStudioGraph(expectationFlow, {});

    for (const attempt of [trace.attempts[0], unbound.attempts[0]]) {
      expect(attempt).toMatchObject({ status: "succeeded", route: "passed", outputs: { passed: true, failed: false } });
      expect(attempt).not.toHaveProperty("failure");
      expect(attempt?.transitionComparison?.status).toBe("matched");
    }
  });

  it("asks the evaluator once, not again through the transition comparison, when it accepts", async () => {
    let calls = 0;
    const trace = await runAutomationStudioGraph(expectationFlow, {
      hostRuntime: {
        capabilities: ["expectation-evaluation"],
        expectationEvaluator: () => {
          calls += 1;
          return { passed: true };
        }
      }
    });

    expect(calls).toBe(1);
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("matched");
  });

});

// Another node's expected state, checked by the host after its action
// succeeded. The Flow goes on to a second output on `success`, so a rejection
// that left the attempt succeeded would dispatch it.
const authRequired = { category: "auth_required", code: "web.auth.required", retryable: false, stage: "verification", expected: "the cart holds an item", actual: "the page is a sign-in form" } as const;
const coreRejection = { category: "expected_state_missing", code: "core.policy.expectation_rejected", retryable: true, stage: "verification" };

function expectedStateFlow(parameters: Record<string, string> = {}): AutomationStudioFlowDocument {
  return {
    ...expectationFlow,
    flowId: "flow.expected-state",
    nodes: [
      { id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", expectedState: { conditions, mode: "any", timeoutMs: 400 }, ...parameters } },
      { id: "after", definitionId: "builtin.policy.action", parameterValues: { outputId: "read-cart" } }
    ],
    edges: [{ id: "edge.output.after", sourceNodeId: "output", targetNodeId: "after", sourcePortId: "success" }]
  };
}

async function runExpectedState(run: { verdict?: AutomationNodeExpectationEvaluation; dispatchFails?: boolean; parameters?: Record<string, string> }) {
  const dispatched: unknown[] = [];
  const asked: unknown[] = [];
  const { verdict } = run;
  const trace = await runAutomationStudioGraph(expectedStateFlow(run.parameters), {
    effectDispatcher: (effect) => {
      const outputId = (effect.payload as { outputId?: unknown } | undefined)?.outputId;
      dispatched.push(outputId);
      return run.dispatchFails && outputId === "activate-element"
        ? { status: "failed", route: "failed", outputs: { ok: false }, message: "The click failed." }
        : { status: "success", route: "success", outputs: { ok: true } };
    },
    hostRuntime: {
      capabilities: ["expectation-evaluation", "state-snapshot"],
      captureStateSnapshot: () => ({ stateSnapshotId: "snap.1", stateRef: "state://cart/1", capturedAt: 5 }),
      ...(verdict ? { expectationEvaluator: (...args: unknown[]) => { asked.push(args); return verdict; } } : {})
    }
  });
  return { trace, dispatched, asked };
}

describe("a rejected expected state fails the attempt", () => {
  it("fails the attempt with the host's record and message, fails the run, and dispatches nothing after it", async () => {
    const { trace, dispatched, asked } = await runExpectedState({ verdict: { passed: false, message: "The cart stayed empty.", checkedConditionCount: 3, failure: authRequired } });

    expect(trace.status).toBe("failed");
    expect(trace.attempts).toHaveLength(1);
    expect(trace.attempts[0]).toMatchObject({ status: "failed", route: "failed", message: "The cart stayed empty." });
    expect(trace.attempts[0]?.failure).toEqual(authRequired);
    expect(trace.attempts[0]?.transitionComparison).toMatchObject({ status: "blocked", diffSummary: { stateCheckCount: 3 } });
    expect(dispatched).toEqual(["activate-element"]);
    expect(asked).toEqual([[conditions, "any", 400, { source: "transition_comparison", nodeId: "output", attemptId: "output.attempt.1", stateRef: "state://cart/1" }]]);
  });

  it("gives Core's expected_state_missing record when the host rejects without one", async () => {
    const { trace, dispatched } = await runExpectedState({ verdict: { passed: false, checkedConditionCount: 3 } });

    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]).toMatchObject({ status: "failed", route: "failed", message: "The host reported that the expected state does not hold." });
    expect(trace.attempts[0]?.failure).toEqual(coreRejection);
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
    expect(dispatched).toEqual(["activate-element"]);
  });

  it("gives Core's record, and its comparison status, in place of a host record that does not parse", async () => {
    // auth_required is never retryable, so this record contradicts itself.
    const { trace } = await runExpectedState({ verdict: { passed: false, failure: { ...authRequired, retryable: true } } });

    expect(trace.attempts[0]?.failure).toEqual(coreRejection);
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
  });

  it("changes nothing when the host accepts", async () => {
    const accepted = await runExpectedState({ verdict: { passed: true, checkedConditionCount: 3 } });
    const unbound = await runExpectedState({});

    for (const { trace, dispatched } of [accepted, unbound]) {
      expect(trace.status).toBe("succeeded");
      expect(trace.attempts[0]).toMatchObject({ status: "succeeded", route: "success", outputs: { ok: true } });
      expect(trace.attempts[0]).not.toHaveProperty("failure");
      expect(trace.attempts[0]).not.toHaveProperty("message");
      expect(dispatched).toEqual(["activate-element", "read-cart"]);
    }
    expect(accepted.trace.attempts[0]?.transitionComparison).toMatchObject({ status: "matched", diffSummary: { stateCheckCount: 3 } });
  });

  it("routes a rejection exactly as a failed dispatch, failureRoute included", async () => {
    // No failure reads an action's failureRoute today: a failed attempt is routed
    // on its own route. A rejection must route the way a failed dispatch carrying
    // the same parameter routes, whatever that way is.
    const parameters = { failureRoute: "success" };
    const rejected = await runExpectedState({ verdict: { passed: false, failure: authRequired }, parameters });
    const dispatchFailed = await runExpectedState({ dispatchFails: true, parameters });
    const routing = ({ trace, dispatched }: Awaited<ReturnType<typeof runExpectedState>>) => ({
      runStatus: trace.status,
      runMessage: trace.message,
      attempts: trace.attempts.length,
      status: trace.attempts[0]?.status,
      route: trace.attempts[0]?.route,
      recovery: trace.attempts[0]?.recoveryDecision?.selected,
      dispatched
    });

    expect(rejected.trace.attempts[0]?.status).toBe("failed");
    expect(routing(rejected)).toEqual(routing(dispatchFailed));
  });
});

// A host keys its after-action capture and its diff on which action ran, so it
// must be told the node that ran, with the parameters the run resolved.
const boundNode: AutomationStudioFlowNode = { id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { selector: { $state: { path: "run.supplied.selector" } } } } };
const resolvedParameterValues = { outputId: "activate-element", parameters: { selector: "#confirm" } };

async function runWithRecordingHost(node: AutomationStudioFlowNode, options: Omit<AutomationStudioGraphExecutionOptions, "inputs" | "hostRuntime">) {
  // Cloned at the call, so each record is what the host was handed then.
  const captures: Array<{ point: string; node: AutomationStudioFlowNode }> = [];
  const diffs: AutomationStudioFlowNode[] = [];
  const trace = await runAutomationStudioGraph({ ...flow, flowId: "flow.host-state-node", nodes: [node] }, {
    ...options,
    inputs: { "run.supplied.selector": "#confirm" },
    hostRuntime: {
      capabilities: ["state-snapshot", "state-diff"],
      captureStateSnapshot: ({ node: captured, attemptId, point }) => {
        captures.push({ point, node: structuredClone(captured) });
        return { stateSnapshotId: `${attemptId}.${point}`, stateRef: `state://${attemptId}/${point}`, capturedAt: 1 };
      },
      inspectStateDiff: ({ node: inspected }) => {
        diffs.push(structuredClone(inspected));
        return { changed: true };
      }
    }
  });
  const afterAction = captures.filter(({ point }) => point === "after_action").map(({ node: captured }) => captured);
  return { trace, captures, afterAction, diffs };
}

describe("what the host is told after the action", () => {
  it("hands the after-action capture and the diff the node that ran, with its resolved parameters, as before it", async () => {
    const { trace, captures, diffs } = await runWithRecordingHost(boundNode, { effectDispatcher: () => succeeded });
    const executed = { ...boundNode, parameterValues: resolvedParameterValues };

    expect(trace.status).toBe("succeeded");
    expect(captures).toEqual([{ point: "before_action", node: executed }, { point: "after_action", node: executed }]);
    expect(diffs).toEqual([executed]);
    expect(diffs[0]?.parameterValues?.outputId).toBe("activate-element");
    expect(trace.attempts[0]).toMatchObject({ stateRefs: { afterAction: { stateRef: "state://output.attempt.1/after_action" }, stateDiff: { changed: true } } });
  });

  it.each([
    { branch: "the dispatch fails", node: boundNode, options: { effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false }, message: "The click failed." }) }, message: "The click failed." },
    { branch: "the dispatch throws", node: boundNode, options: { effectDispatcher: () => { throw new Error("The transport closed."); } }, message: "The transport closed." },
    { branch: "the node pins a version Core does not have", node: { ...boundNode, definitionVersion: "2.0.0" }, options: {}, message: "Node builtin.policy.action pins 2.0.0, but built-in version 1.0.0 is available." },
    { branch: "the node is not executable", node: { ...boundNode, definitionId: "importer.example.unregistered" }, options: {}, message: "Node definition is not executable: importer.example.unregistered." }
  ] satisfies Array<{ branch: string; node: AutomationStudioFlowNode; options: Omit<AutomationStudioGraphExecutionOptions, "inputs" | "hostRuntime">; message: string }>)("hands them the node that ran when $branch", async ({ node, options, message }) => {
    const { trace, afterAction, diffs } = await runWithRecordingHost(node, options);
    const executed = { ...node, parameterValues: resolvedParameterValues };

    expect(trace.attempts[0]).toMatchObject({ status: "failed", message, stateRefs: { afterAction: { stateRef: "state://output.attempt.1/after_action" }, stateDiff: { changed: true } } });
    expect(afterAction.length).toBeGreaterThan(0);
    expect(afterAction).toEqual(afterAction.map(() => executed));
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs).toEqual(diffs.map(() => executed));
  });
});

// Obviously synthetic: every assertion about these is where they must or must not travel.
const ROW_TEXT = "synthetic-extracted-row-that-must-never-be-persisted";
const EXCLUDED_NOTE = "synthetic-excluded-note";
const recordOutput = {
  datasetId: "products",
  recordsPath: "items",
  writeMode: "append",
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }, { id: "note", label: "Note", valueType: "string", handling: "exclude" }] }
};
const extractNode: AutomationStudioFlowNode = { id: "extract", definitionId: "builtin.policy.action", parameterValues: { outputId: "extract-list", parameters: {}, recordOutput } };
const recordFlow: AutomationStudioFlowDocument = {
  ...flow,
  flowId: "flow.record-capture",
  nodes: [extractNode, { id: "after", definitionId: "builtin.policy.action", parameterValues: { outputId: "after-extract" } }],
  edges: [{ id: "extract.after", sourceNodeId: "extract", targetNodeId: "after", sourcePortId: "success" }]
};
const savedDigest = "a".repeat(64);

function extractingDispatcher(events: string[], extractedResult: boolean = true): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => {
    const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId);
    events.push(`dispatch:${outputId}`);
    if (outputId !== "extract-list") return succeeded;
    return extractedResult
      ? { status: "success", route: "success", outputs: { ok: true, result: { items: [{ name: ROW_TEXT, note: EXCLUDED_NOTE }, { note: EXCLUDED_NOTE }] } } }
      : { status: "success", route: "success", outputs: { ok: true } };
  };
}

function storedSummary(batch: AutomationStudioRecordBatch): AutomationStudioRunDatasetSummary {
  return { runId: "run.synthetic", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: savedDigest, recordCount: batch.rows.length, truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
}

describe("capturing records where dispatches meet", () => {
  it("calls the record-batch hook once, with the validated rows, and waits for it before the attempt is returned", async () => {
    const events: string[] = [];
    const batches: AutomationStudioRecordBatch[] = [];
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const trace = await runAutomationStudioGraph(recordFlow, {
      effectDispatcher: extractingDispatcher(events),
      onRecordBatch: async (batch) => {
        batches.push(batch);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("hook:stored");
        return storedSummary(batch);
      }
    }, (run) => { executed.push(run); });

    expect(trace.status).toBe("succeeded");
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ nodeId: "extract", attemptId: "extract.attempt.1", batchKey: "extract.attempt.1", datasetId: "products", writeMode: "append", rows: [{ name: ROW_TEXT }], invalidCount: 1, truncated: false });
    expect(events).toEqual(["dispatch:extract-list", "hook:stored", "dispatch:after-extract"]);
    expect(executed[0]?.attempts[0]?.outputs.records).toBe(batches[0]?.rows);
    expect(trace.attempts[0]?.outputs.records).toEqual({ $dataset: { datasetId: "products", recordCount: 1, schemaDigest: savedDigest } });
    expect(JSON.stringify(trace)).not.toContain(ROW_TEXT);
  });

  it.each([
    { case: "throws", onRecordBatch: (): AutomationStudioRunDatasetSummary => { throw new Error(`The store refused ${ROW_TEXT}.`); } },
    { case: "rejects", onRecordBatch: (): Promise<AutomationStudioRunDatasetSummary> => Promise.reject(new Error(`The store refused ${ROW_TEXT}.`)) }
  ])("fails the attempt with record_output.persist_failed when the hook $case, and keeps the rows out of the saved trace", async ({ onRecordBatch }) => {
    const events: string[] = [];
    const trace = await runAutomationStudioGraph(recordFlow, { effectDispatcher: extractingDispatcher(events), onRecordBatch });

    expect(trace.status).toBe("failed");
    expect(trace.attempts).toHaveLength(1);
    expect(trace.attempts[0]).toMatchObject({ status: "failed", route: "failed", message: "The output ran, but the records it returned could not be saved." });
    expect(trace.attempts[0]?.failure).toEqual({ category: "action_failed", code: "record_output.persist_failed", retryable: false });
    expect(events).toEqual(["dispatch:extract-list"]);
    expect(trace.attempts[0]?.outputs.records).toEqual({ $dataset: { datasetId: "products", recordCount: 1 } });
    expect(JSON.stringify(trace)).not.toContain(ROW_TEXT);
  });

  it("still emits records with no hook bound, and the saved trace holds a marker for them", async () => {
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const trace = await runAutomationStudioGraph(recordFlow, { effectDispatcher: extractingDispatcher([]) }, (run) => { executed.push(run); });

    expect(trace.status).toBe("succeeded");
    expect(executed[0]?.attempts[0]?.outputs.records).toEqual([{ name: ROW_TEXT }]);
    expect(JSON.stringify(executed[0])).not.toContain(EXCLUDED_NOTE);
    expect(trace.attempts[0]?.outputs.records).toEqual({ $dataset: { datasetId: "products", recordCount: 1 } });
    expect(JSON.stringify(trace)).not.toContain(ROW_TEXT);
  });

  it("captures a native node's record output the same way", async () => {
    const batches: AutomationStudioRecordBatch[] = [];
    const trace = await runAutomationStudioGraph({ ...flow, flowId: "flow.native-record-capture", nodes: [{ id: "native", definitionId: "importer.example.extract" }] }, {
      nativeNodeExecutor: () => Promise.resolve({ result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput } }] } }),
      effectDispatcher: extractingDispatcher([]),
      onRecordBatch: (batch) => { batches.push(batch); return storedSummary(batch); }
    });

    expect(trace.status).toBe("succeeded");
    expect(batches.map((batch) => [batch.nodeId, batch.attemptId, batch.rows])).toEqual([["native", "native.attempt.1", [{ name: ROW_TEXT }]]]);
    expect(JSON.stringify(trace)).not.toContain(ROW_TEXT);
  });

  it("calls no hook and fails with record_output.records_missing when the output returns no rows", async () => {
    const batches: AutomationStudioRecordBatch[] = [];
    const trace = await runAutomationStudioGraph(recordFlow, {
      effectDispatcher: extractingDispatcher([], false),
      onRecordBatch: (batch) => { batches.push(batch); return storedSummary(batch); }
    });

    expect(batches).toEqual([]);
    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]?.failure).toEqual({ category: "output_not_observed", code: "record_output.records_missing", retryable: true });
  });
});

describe("writing records, which no dispatcher handles", () => {
  // The rows arrive as a run input, which the saved trace withholds wherever it was supplied.
  const writeFlow: AutomationStudioFlowDocument = { ...flow, flowId: "flow.write-records", nodes: [{ id: "write", definitionId: "builtin.data.write-records", parameterValues: { recordOutput } }] };
  const supplied = () => ({ records: [{ name: ROW_TEXT, note: EXCLUDED_NOTE }, { note: EXCLUDED_NOTE }] });

  it("persists records.write through the record-batch hook with no dispatcher bound, and the saved trace holds markers", async () => {
    const batches: AutomationStudioRecordBatch[] = [];
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const trace = await runAutomationStudioGraph(writeFlow, {
      inputs: supplied(),
      onRecordBatch: (batch) => { batches.push(batch); return storedSummary(batch); }
    }, (run) => { executed.push(run); });
    const marker = { $dataset: { datasetId: "products", recordCount: 1, schemaDigest: savedDigest } };

    expect(trace.status).toBe("succeeded");
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ nodeId: "write", attemptId: "write.attempt.1", batchKey: "write.attempt.1", datasetId: "products", writeMode: "append", rows: [{ name: ROW_TEXT }], invalidCount: 1, truncated: false });
    expect(executed[0]?.attempts[0]?.outputs.records).toBe(batches[0]?.rows);
    expect((executed[0]?.attempts[0]?.effects[0]?.payload as { records?: unknown } | undefined)?.records).toBe(batches[0]?.rows);
    expect(trace.attempts[0]?.outputs.records).toEqual(marker);
    expect(trace.attempts[0]?.effects[0]).toMatchObject({ type: "records.write", payload: { records: marker } });
    expect(trace.effects[0]).toMatchObject({ type: "records.write", nodeId: "write", payload: { records: marker } });
    expect(JSON.stringify(trace)).not.toContain(ROW_TEXT);
    expect(JSON.stringify(trace)).not.toContain(EXCLUDED_NOTE);
  });

  it("fails with record_output.persist_failed when the hook throws, and keeps the rows out of the saved trace", async () => {
    const trace = await runAutomationStudioGraph(writeFlow, {
      inputs: supplied(),
      onRecordBatch: () => { throw new Error(`The store refused ${ROW_TEXT}.`); }
    });

    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]).toMatchObject({ status: "failed", route: "failed", message: "The records could not be saved." });
    expect(trace.attempts[0]?.failure).toEqual({ category: "action_failed", code: "record_output.persist_failed", retryable: false });
    expect(trace.attempts[0]?.outputs.records).toEqual({ $dataset: { datasetId: "products", recordCount: 1 } });
    expect(JSON.stringify(trace)).not.toContain(ROW_TEXT);
  });

  it("does not hand records.write to a dispatcher that is bound", async () => {
    const dispatched: string[] = [];
    const batches: AutomationStudioRecordBatch[] = [];
    const trace = await runAutomationStudioGraph(writeFlow, {
      inputs: supplied(),
      effectDispatcher: (effect) => { dispatched.push(effect.type); return succeeded; },
      onRecordBatch: (batch) => { batches.push(batch); return storedSummary(batch); }
    });

    expect(trace.status).toBe("succeeded");
    expect(dispatched).toEqual([]);
    expect(batches).toHaveLength(1);
  });
});
