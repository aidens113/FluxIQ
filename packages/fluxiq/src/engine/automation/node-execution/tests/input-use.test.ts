// t905 C1: node-invocation value coverage. Each actual callback a node attempt makes (builtin execute, native
// callback, composite callback, Call Subflow helper) is its own event; only that invocation, handed the prepared
// pair, may seal `node_invocation_values`. Absent or unknown proof executes the ordinary original pair.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationNodeStateBinding } from "../../../../components/automation/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";
import { automationStudioRootInvocation, type AutomationStudioSubflowGraph } from "../../frames/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import {
  AutomationStudioGraphInputUseSession, type AutomationStudioInputUseAuthority, type AutomationStudioInputUseLease,
  type AutomationStudioInputUseNodeCapture, type AutomationStudioInputUseNodeLease, type AutomationStudioInputUseNodeObservation, type AutomationStudioInputUseRead
} from "../../input-use/index.ts";

type NodeOpen = NonNullable<AutomationStudioInputUseAuthority["node"]>;
const entryReference = { ownerId: "input.owner.synthetic", bindingId: "input.binding.synthetic", revision: 1 };

function graph(nodes: AutomationStudioFlowNode[], flowId = "flow.node-use"): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.${node.id}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId, ownerKind: "task", ownerId: "task.node-use", name: flowId, nodes, edges, createdAt: 1, updatedAt: 1 };
}

function entryLease(values: JsonObject): AutomationStudioInputUseLease {
  const held = structuredClone(values);
  return { reference: entryReference, executionCopy: () => structuredClone(held), verifyCurrent: async () => ({ status: "bound", value: true }), close: () => {} };
}

/** A node lease over exactly what it was shown, with counted checks and closes. */
function nodeLease(capture: AutomationStudioInputUseNodeCapture, count: { leases: number; checks: number; closes: number }, current: () => AutomationStudioInputUseRead<true> = () => ({ status: "bound", value: true })): AutomationStudioInputUseNodeLease {
  count.leases += 1;
  const held = structuredClone(capture.values), bindingId = `node.binding.${count.leases}`;
  return { reference: { ownerId: "node.owner.synthetic", bindingId, revision: 1 }, executionCopy: () => structuredClone(held), verifyCurrent: async () => {
    count.checks += 1;
    return current();
  }, close: () => { count.closes += 1; } };
}

function proving(node?: NodeOpen) {
  const authority: AutomationStudioInputUseAuthority = {
    open: async capture => ({ status: "bound", value: entryLease(capture.values) }),
    child: async () => ({ status: "bound", value: authority }),
    ...(node ? { node } : {})
  };
  return new AutomationStudioGraphInputUseSession(authority);
}

async function run(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions) {
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  const saved = await runAutomationStudioGraph(flow, options, trace => { executed = trace; });
  return { saved, executed: executed! };
}

function events(session: AutomationStudioGraphInputUseSession, trace: object): readonly AutomationStudioInputUseNodeObservation[] {
  const read = session.readNodes(trace);
  if (read.status !== "bound") throw new Error(`node observations unavailable: ${read.code}`);
  return read.value;
}

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const nativeReturning = (value: JsonValue): NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]> => async () => ({ result: { status: "success", route: "success", outputs: { value } } });

describe("node invocation values (t905 C1)", () => {
  it("executes a builtin from the lease's prepared pair while the authority works, and seals that callback alone", async () => {
    const produced = { nested: "before" }, count = { leases: 0, checks: 0, closes: 0 }, captures: AutomationStudioInputUseNodeCapture[] = [];
    const session = proving(async capture => {
      captures.push(capture);
      if (capture.nodeId === "echo") produced.nested = "after";
      await Promise.resolve();
      return { status: "bound", value: nodeLease(capture, count) };
    });
    const flow = graph([{ id: "native", definitionId: "synthetic.native" }, { id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("native.value") } }]);
    const { saved, executed } = await run(flow, { inputs: { query: "synthetic-private-input" }, inputUse: session.port, nativeNodeExecutor: nativeReturning(produced) });
    expect(saved.status, saved.message).toBe("succeeded");
    expect(executed.values["echo.value"]).toEqual({ nested: "before" });
    expect(produced.nested).toBe("after");
    // Attempt numbers count across the run; the label is whatever the executed attempt carried.
    const echoAttempt = executed.attempts.find(attempt => attempt.nodeId === "echo")!.attemptId;
    const echo = captures.find(capture => capture.nodeId === "echo")!;
    expect(echo.values.parameters).toEqual({ value: { nested: "before" } });
    expect(Object.isFrozen(echo.values) && Object.isFrozen(echo.values.parameters)).toBe(true);
    expect(echo).toMatchObject({ consumer: "builtin", attemptId: echoAttempt, entry: entryReference, location: { graphFlowId: flow.flowId } });
    const observed = events(session, saved);
    expect(observed.map(event => [event.nodeId, event.consumer, event.status])).toEqual([["native", "native_callback", "sealed"], ["echo", "builtin", "sealed"]]);
    expect(observed[1]).toMatchObject({ coverage: "node_invocation_values", reference: { bindingId: "node.binding.2" }, attemptId: echoAttempt });
    expect(observed[1]!.uncovered).toEqual(expect.arrayContaining(["variables", "iteration", "effects"]));
    expect(events(session, executed)).toEqual(observed);
    expect(count.closes).toBe(count.leases);
    expect(count.checks).toBe(2 * count.leases);
    expect(JSON.stringify(observed)).not.toMatch(/synthetic-private-input|before|after/u);
  });

  it("refuses a different lease copy: the original pair executes and the event stays unknown", async () => {
    let closes = 0;
    const session = proving(async () => ({ status: "bound", value: { reference: { ownerId: "node.owner.synthetic", bindingId: "node.binding.x", revision: 1 },
      executionCopy: () => ({ inputs: {}, parameters: { value: "substitution" } }), verifyCurrent: async () => ({ status: "bound", value: true }), close: () => { closes += 1; } } }));
    const flow = graph([{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }]);
    const { saved, executed } = await run(flow, { inputs: { query: "original" }, inputUse: session.port });
    expect(saved.status).toBe("succeeded");
    expect(executed.values["echo.value"]).toBe("original");
    expect(events(session, saved)).toEqual([expect.objectContaining({ status: "unknown", code: "lease_mismatch", consumer: "builtin", nodeId: "echo" })]);
    expect(closes).toBe(1);
  });

  it("without a node authority keeps the ordinary original references and records an unknown event", async () => {
    const flow = graph([{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }]);
    const ordinary = await run(flow, { inputs: { query: { nested: "synthetic" } } });
    expect(ordinary.executed.values["echo.value"]).toBe(ordinary.executed.values.query);
    const session = proving();
    const { saved, executed } = await run(flow, { inputs: { query: { nested: "synthetic" } }, inputUse: session.port });
    expect(saved.status).toBe("succeeded");
    expect(executed.values["echo.value"]).toBe(executed.values.query);
    expect(events(session, saved)).toEqual([expect.objectContaining({ status: "unknown", code: "authority_unavailable", consumer: "builtin", nodeId: "echo", attemptId: "echo.attempt.1" })]);
  });

  it("records the native callback and the composite callback it falls through to as separate events, each with its own pair", async () => {
    const produced = { nested: "before" }, count = { leases: 0, checks: 0, closes: 0 };
    const session = proving(async capture => {
      if (capture.nodeId === "mixed" && capture.consumer === "native_callback") produced.nested = "after";
      return { status: "bound", value: nodeLease(capture, count) };
    });
    const seen: Array<{ kind: string; label: unknown; target?: unknown; inputs: unknown }> = [];
    // `lifted` hands the test's own object onward, so the authority's mutation reaches the original pair.
    const flow = graph([
      { id: "lifted", definitionId: "synthetic.native" },
      { id: "mixed", definitionId: "synthetic.composite", parameterValues: { label: automationNodeStateBinding("lifted.value"), target: "synthetic-target" } }
    ]);
    const { saved, executed } = await run(flow, {
      inputUse: session.port,
      nativeNodeExecutor: async request => {
        if (request.node.id === "lifted") return { result: { status: "success", route: "success", outputs: { value: produced } } };
        seen.push({ kind: "native", label: structuredClone(request.node.parameterValues?.label), target: request.hostContext?.target, inputs: request.inputs });
        return undefined;
      },
      compositeExecutor: async request => {
        seen.push({ kind: "composite", label: structuredClone(request.node.parameterValues?.label), inputs: request.inputs });
        return { result: { status: "success", route: "success", outputs: {} } };
      }
    });
    expect(saved.status, saved.message).toBe("succeeded");
    expect(seen.map(entry => [entry.kind, entry.label])).toEqual([["native", { nested: "before" }], ["composite", { nested: "after" }]]);
    expect(seen[0]!.target).toBe("synthetic-target");
    const mixed = events(session, saved).filter(event => event.nodeId === "mixed");
    const mixedAttempt = executed.attempts.find(attempt => attempt.nodeId === "mixed")!.attemptId;
    expect(mixed.map(event => [event.consumer, event.status, event.attemptId])).toEqual([["native_callback", "sealed", mixedAttempt], ["composite_callback", "sealed", mixedAttempt]]);
    expect(mixed[0]!.status === "sealed" && mixed[1]!.status === "sealed" && mixed[0]!.reference.bindingId !== mixed[1]!.reference.bindingId).toBe(true);
    expect(mixed[0]!.uncovered).toContain("native_implementation");
    expect(count.closes).toBe(count.leases);
  });

  it("creates no invocation event for a missing binding", async () => {
    const opened: AutomationStudioInputUseNodeCapture[] = [];
    const session = proving(async capture => {
      opened.push(capture);
      return { status: "unknown", code: "producer_unverified" };
    });
    const flow = graph([{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("absent.value") } }]);
    const { saved } = await run(flow, { inputs: {}, inputUse: session.port });
    expect(saved.status).toBe("failed");
    expect(opened).toEqual([]);
    expect(events(session, saved)).toEqual([]);
  });

  it("leaves an event unknown when its producer changes after the callback, and closes each lease once", async () => {
    const count = { leases: 0, checks: 0, closes: 0 };
    // The first check is before the callback; the producer has changed by the check after it.
    const session = proving(async capture => ({ status: "bound", value: nodeLease(capture, count, () => count.checks <= 1 ? { status: "bound", value: true } : { status: "unknown", code: "stale" }) }));
    const flow = graph([{ id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.inspect" } }]);
    const { saved } = await run(flow, { inputs: {}, inputUse: session.port, effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }) });
    expect(saved.status).toBe("succeeded");
    expect(events(session, saved)).toEqual([expect.objectContaining({ status: "unknown", code: "stale", consumer: "builtin", nodeId: "act" })]);
    expect(count.closes).toBe(1);
  });

  it("gates cancellation before invocation, keeps the exact reason, and closes a late lease once", async () => {
    const entered = gate<void>(), late = gate<AutomationStudioInputUseRead<AutomationStudioInputUseNodeLease>>();
    const controller = new AbortController(), reason = new Error("synthetic-cancel-during-node-proof");
    const unhandled: unknown[] = [];
    const observe = (error: unknown) => { unhandled.push(error); };
    let invoked = 0, closes = 0;
    const session = proving(async () => {
      entered.resolve();
      return await late.promise;
    });
    process.on("unhandledRejection", observe);
    try {
      const flow = graph([{ id: "act", definitionId: "synthetic.native" }]);
      const running = run(flow, { inputs: {}, signal: controller.signal, inputUse: session.port, nativeNodeExecutor: async () => {
        invoked += 1;
        return { result: { status: "success", route: "success", outputs: {} } };
      } });
      await entered.promise;
      controller.abort(reason);
      const { saved } = await running;
      // The run's existing cancellation ending; node use adds none of its own.
      expect(saved.status).toBe("cancelled");
      expect(invoked).toBe(0);
      expect(controller.signal.reason).toBe(reason);
      late.resolve({ status: "bound", value: { reference: { ownerId: "node.owner.synthetic", bindingId: "late", revision: 1 }, executionCopy: () => ({ inputs: {}, parameters: {} }),
        verifyCurrent: async () => ({ status: "bound", value: true }), close: () => {
          closes += 1;
          throw new Error("synthetic-late-close-failed");
        } } });
      await new Promise<void>(done => setImmediate(done));
      expect(closes).toBe(1);
      expect(unhandled).toEqual([]);
      // The gate's own disposition: never invoked, so never sealed.
      expect(events(session, saved)).toEqual([expect.objectContaining({ status: "unknown", code: "cancelled", consumer: "native_callback", nodeId: "act" })]);
    } finally {
      process.removeListener("unhandledRejection", observe);
      session.close();
    }
  });

  it("mints nothing for a pinned-version refusal or a node no callback can run", async () => {
    const opened: AutomationStudioInputUseNodeCapture[] = [];
    const open: NodeOpen = async capture => {
      opened.push(capture);
      return { status: "unknown", code: "producer_unverified" };
    };
    const sessions = [proving(open), proving(open)];
    const pinned = await run(graph([{ id: "echo", definitionId: "builtin.data.constant", definitionVersion: "2.0.0", parameterValues: { value: 1 } }]), { inputs: {}, inputUse: sessions[0]!.port });
    expect(pinned.saved.attempts[0]?.failure?.code).toBe("executor.node.definition_version_unavailable");
    const inert = await run(graph([{ id: "inert", definitionId: "synthetic.unregistered" }]), { inputs: {}, inputUse: sessions[1]!.port });
    expect(inert.saved.attempts[0]?.failure?.code).toBe("executor.node.not_executable");
    expect(opened).toEqual([]);
    expect(events(sessions[0]!, pinned.saved)).toEqual([]);
    expect(events(sessions[1]!, inert.saved)).toEqual([]);
  });

  it("withdraws a node seal when the frame's own entry turns stale before completion", async () => {
    let entryChecks = 0;
    const authority: AutomationStudioInputUseAuthority = {
      open: async capture => ({ status: "bound", value: { ...entryLease(capture.values), verifyCurrent: async () => (++entryChecks === 1 ? { status: "bound", value: true } : { status: "unknown", code: "stale" }) } }),
      child: async () => ({ status: "unknown", code: "fork_unverified" }),
      node: async capture => ({ status: "bound", value: nodeLease(capture, { leases: 0, checks: 0, closes: 0 }) })
    };
    const session = new AutomationStudioGraphInputUseSession(authority);
    const { saved } = await run(graph([{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }]), { inputs: { query: "synthetic" }, inputUse: session.port });
    expect(saved.status).toBe("succeeded");
    expect(session.read(saved)).toEqual({ status: "unknown", code: "stale" });
    expect(events(session, saved)).toEqual([expect.objectContaining({ status: "unknown", code: "entry_unverified", nodeId: "echo" })]);
  });

  it("keeps concurrent same-id attempts in separate sessions apart, and exposes no writer on the port", async () => {
    const counts = [{ leases: 0, checks: 0, closes: 0 }, { leases: 0, checks: 0, closes: 0 }];
    const sessions = counts.map(count => proving(async capture => ({ status: "bound", value: nodeLease(capture, count) })));
    const flow = graph([{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }]);
    const [first, second] = await Promise.all(sessions.map((session, index) => run(flow, { inputs: { query: `synthetic-${index}` }, inputUse: session.port })));
    expect(events(sessions[0]!, first!.saved)).toHaveLength(1);
    expect(events(sessions[1]!, second!.saved)).toHaveLength(1);
    expect(sessions[0]!.readNodes(second!.saved)).toEqual({ status: "unknown", code: "unobserved" });
    expect(sessions[0]!.readNodes(JSON.parse(JSON.stringify(first!.saved)))).toEqual({ status: "unknown", code: "unobserved" });
    expect(Reflect.ownKeys(sessions[0]!.port)).toEqual([]);
    expect("node" in sessions[0]!.port).toBe(false);
    sessions[0]!.close();
    expect(sessions[0]!.readNodes(first!.saved)).toEqual({ status: "unknown", code: "session_closed" });
    sessions[1]!.close();
  });
});

// Captured rows reach node inputs (every value the run holds) and Call Subflow parameters; a copy would lose markers.
const ROW = "synthetic-extracted-row-that-must-never-be-persisted";
const extractedDataset = { $dataset: { datasetId: "products", recordCount: 2 } };
const echoChild: AutomationStudioSubflowGraph = {
  subflowId: "echo", graphRevision: 1,
  graph: graph([{ id: "start", definitionId: "builtin.control.start" }, { id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("items") } }], "graph.echo"),
  artifact: { interface: { inputs: [{ id: "items", name: "Items", valueType: { kind: "json" } }], outputs: [] }, errors: [] } as unknown as NonNullable<AutomationStudioSubflowGraph["artifact"]>
};
const extractNode: AutomationStudioFlowNode = { id: "extract", definitionId: "builtin.policy.action", parameterValues: { outputId: "extract-list", parameters: {}, recordOutput: {
  datasetId: "products", recordsPath: "items", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }, { id: "price", label: "Price", valueType: "number" }] }
} } };

async function runParent(items: JsonValue, before: AutomationStudioFlowNode[], session: AutomationStudioGraphInputUseSession) {
  const flow = graph([{ id: "start", definitionId: "builtin.control.start" }, extractNode, ...before, { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "echo", inputs: { items }, outputs: { "echo.value": "echoed" } } }], "graph.node-use-parent");
  const entries: Array<Record<string, JsonValue>> = [];
  const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main" }, async (target, options, onExecuted) => await runAutomationStudioGraph(target.graph, options, (real, kept) => {
    entries.push(real.values);
    onExecuted?.(real, kept);
  }));
  const result = await run(flow, { inputs: {}, currentSubflowId: "main", invocation, inputUse: session.port, subflowGraphs: { load: async id => (id === "echo" ? echoChild : undefined) },
    effectDispatcher: effect => (effect.payload as { outputId?: unknown } | undefined)?.outputId === "extract-list"
      ? { status: "success", route: "success", outputs: { ok: true, result: { items: [{ name: ROW, price: 3 }, { name: `${ROW}-second` }] } } }
      : { status: "success", route: "success", outputs: { ok: true } } });
  return { ...result, entries, extracted: result.executed.attempts.find(attempt => attempt.nodeId === "extract")!.outputs.records };
}

describe("captured rows at node input and parameter positions (t905 C1)", () => {
  it("keeps original references and dataset markers, and asks no node authority about them", async () => {
    const count = { leases: 0, checks: 0, closes: 0 }, asked: string[] = [];
    const session = proving(async capture => {
      asked.push(capture.nodeId);
      return { status: "bound", value: nodeLease(capture, count) };
    });
    const observed = await runParent(automationNodeStateBinding("extract.records"), [{ id: "after", definitionId: "builtin.data.constant", parameterValues: { value: 1 } }], session);
    expect(observed.saved.status, observed.saved.message).toBe("succeeded");
    expect(observed.entries[0]!.items).toBe(observed.extracted);
    expect(observed.saved.values.echoed).toEqual(extractedDataset);
    expect(JSON.stringify(observed.saved)).not.toContain(ROW);
    const parentEvents = events(session, observed.saved);
    expect(parentEvents.filter(event => event.nodeId === "after" || event.nodeId === "call").map(event => [event.nodeId, event.consumer, event.status === "unknown" ? event.code : event.status]))
      .toEqual([["after", "builtin", "captured_records"], ["call", "call_subflow", "captured_records"]]);
    expect(asked).not.toContain("after");
    expect(asked).not.toContain("call");
    expect(count.closes).toBe(count.leases);
  });

  it("seals the Call Subflow helper's parameters for independently built data and hands the child that copy", async () => {
    const count = { leases: 0, checks: 0, closes: 0 };
    const session = proving(async capture => ({ status: "bound", value: nodeLease(capture, count) }));
    const lookalike = [{ name: ROW, price: 3 }];
    const flow = graph([{ id: "copy", definitionId: "builtin.data.constant", parameterValues: { value: lookalike } },
      { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "echo", inputs: { items: automationNodeStateBinding("copy.value") }, outputs: { "echo.value": "echoed" } } }], "graph.node-use-lookalike");
    const entries: Array<Record<string, JsonValue>> = [];
    const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main" }, async (target, options, onExecuted) => await runAutomationStudioGraph(target.graph, options, (real, kept) => {
      entries.push(real.values);
      onExecuted?.(real, kept);
    }));
    const { saved, executed } = await run(flow, { inputs: {}, currentSubflowId: "main", invocation, inputUse: session.port, subflowGraphs: { load: async id => (id === "echo" ? echoChild : undefined) } });
    expect(saved.status, saved.message).toBe("succeeded");
    expect(entries[0]!.items).toEqual(lookalike);
    expect(entries[0]!.items).not.toBe(executed.values["copy.value"]);
    const call = events(session, saved).find(event => event.nodeId === "call")!;
    expect(call).toMatchObject({ status: "sealed", consumer: "call_subflow", coverage: "node_invocation_values" });
    expect(call.uncovered).toContain("child_entry");
    expect(count.closes).toBe(count.leases);
  });
});

// A target that goes stale three times, then a source-less refresh hands the fourth attempt a fresh selector.
const stale = { category: "target_not_found" as const, code: "example.target.stale", retryable: true, stage: "target_resolution" as const, effect: "unacted" as const };
const refresh = { container: "node" as const, definitionId: "example.activate", definitionVersion: "1.0.0", parameterIds: ["selector", "element"], removableParameterIds: ["selector"] };
type NativeRequest = Parameters<NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>>[0];

async function retried(session: AutomationStudioGraphInputUseSession) {
  const calls: NativeRequest[] = [];
  let snapshots = 0;
  const flow = graph([{ id: "act", definitionId: "example.activate", parameterValues: { selector: "old", element: { identity: "specimen-17", address: "old" }, note: "unchanged" }, metadata: { effect: "observe", declaredConsequences: [] } }]);
  const result = await run(flow, {
    inputs: { query: "synthetic" }, inputUse: session.port, delay: async () => undefined,
    resolveTargetRefresh: () => ({ kind: "declared", refresh }),
    hostRuntime: {
      capabilities: ["state-snapshot"],
      captureStateSnapshot: () => ({ stateSnapshotId: `snapshot-${++snapshots}`, stateRef: `snapshot-${snapshots}`, capturedAt: 1 }),
      reacquireUnboundTarget: async () => ({ outcome: "found", patches: [{ operation: "set", parameterId: "selector", value: "fresh" }] })
    },
    nativeNodeExecutor: async request => {
      calls.push(request);
      return { result: request.node.parameterValues?.selector === "fresh" ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", outputs: {}, failure: { ...stale } } };
    }
  });
  return { ...result, calls };
}

describe("retries and target refresh (t905 C1)", () => {
  it("recaptures every actual retry, after its refresh, and hands each call exactly its own prepared pair", async () => {
    const count = { leases: 0, checks: 0, closes: 0 }, captures: AutomationStudioInputUseNodeCapture[] = [];
    const session = proving(async capture => {
      captures.push(capture);
      return { status: "bound", value: nodeLease(capture, count) };
    });
    const { saved, calls } = await retried(session);
    expect(saved.status, saved.message).toBe("succeeded");
    expect(calls.map(call => call.node.parameterValues?.selector)).toEqual(["old", "old", "old", "fresh"]);
    expect(captures.map(capture => [capture.values.parameters.selector, capture.refreshed])).toEqual([["old", false], ["old", false], ["old", false], ["fresh", true]]);
    expect(new Set(captures.map(capture => capture.occurrence)).size).toBe(4);
    calls.forEach((call, index) => {
      expect(call.node.parameterValues).toEqual(captures[index]!.values.parameters);
      expect(call.node.parameterValues).not.toBe(captures[index]!.values.parameters);
      expect(call.inputs).toEqual(captures[index]!.values.inputs);
    });
    const observed = events(session, saved);
    expect(observed.map(event => [event.consumer, event.status, event.attemptId])).toEqual(saved.attempts.map(attempt => ["native_callback", "sealed", attempt.attemptId]));
    expect(count.closes).toBe(4);
  });

  it("refuses an authority that keeps the pre-refresh lease, while the refreshed attempt still runs as before", async () => {
    let first: AutomationStudioInputUseNodeCapture | undefined;
    const count = { leases: 0, checks: 0, closes: 0 };
    const session = proving(async capture => ({ status: "bound", value: nodeLease(first ??= capture, count) }));
    const { saved, calls } = await retried(session);
    expect(saved.status, saved.message).toBe("succeeded");
    expect(calls.at(-1)!.node.parameterValues?.selector).toBe("fresh");
    expect(events(session, saved).map(event => event.status === "sealed" ? "sealed" : event.code)).toEqual(["sealed", "sealed", "sealed", "lease_mismatch"]);
    expect(count.closes).toBe(4);
  });
});
