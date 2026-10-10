import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationNodeStateBinding } from "../../../../nodes/index.ts";
import { automationStudioNodeRetryPolicy, runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";
import { automationStudioRootInvocation, type AutomationStudioSubflowGraph, type AutomationStudioSubflowGraphSource } from "../index.ts";

const CALL = "builtin.control.call-subflow";

function graph(flowId: string, nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.${node.id}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, nodes, edges, createdAt: 1, updatedAt: 1 };
}

function source(graphs: Record<string, AutomationStudioSubflowGraph>, loads: string[] = []): AutomationStudioSubflowGraphSource {
  return {
    load: async (subflowId) => {
      loads.push(subflowId);
      return graphs[subflowId];
    }
  };
}

async function run(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<{ saved: AutomationStudioGraphExecutionTrace; executed: AutomationStudioGraphExecutionTrace }> {
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  const saved = await runAutomationStudioGraph(flow, options, (trace) => { executed = trace; });
  return { saved, executed: executed ?? saved };
}

// The child reads what it was handed, tries to read a parent value nobody bound, and makes one of its own.
const child: AutomationStudioSubflowGraph = {
  subflowId: "child",
  graphRevision: 3,
  graph: graph("graph.child", [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } },
    { id: "peek", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("ambient", "absent") } },
    { id: "hidden", definitionId: "builtin.data.constant", parameterValues: { value: "child-only" } }
  ])
};

// Its input is bound to a parent value, read when the call runs, as any parameter binding is; a run that has none passes "none".
const caller = graph("graph.parent", [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "call", definitionId: CALL, parameterValues: { subflowId: "child", inputs: { query: automationNodeStateBinding("parentQuery", "none") }, outputs: { "echo.value": "echoed", "peek.value": "peeked" } } }
]);

describe("Call Subflow", () => {
  it("runs the child as a frame of its own, and only bound values cross its boundary", async () => {
    const options: AutomationStudioGraphExecutionOptions = { inputs: { parentQuery: "hello", ambient: "parent-only" }, currentSubflowId: "main", subflowGraphs: source({ child }) };
    const { saved, executed } = await run(caller, options);

    expect(saved.status).toBe("succeeded");
    expect(executed.values.echoed).toBe("hello");
    // The parent's own value never reached the child: its binding fell back.
    expect(executed.values.peeked).toBe("absent");
    // A child value no binding names stays in the child.
    expect(Object.keys(executed.values).filter((key) => key.startsWith("hidden") || key === "echo.value")).toEqual([]);
    expect(Object.values(executed.values)).not.toContain("child-only");

    const call = saved.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(call.subflowTarget).toEqual({ subflowId: "child", graphFlowId: "graph.child", graphRevision: 3 });
    expect(call.childTrace?.status).toBe("succeeded");
    // Attempts carry the frames they ran in, outermost first.
    expect(saved.attempts.map((attempt) => attempt.framePath)).toEqual([["invocation-1"], ["invocation-1"]]);
    expect(call.childTrace?.attempts.map((attempt) => attempt.framePath)).toEqual(Array(4).fill(["invocation-1", "invocation-2"]));
    // The caller's options were never framed in place; the run left nothing on a stack.
    expect(options.invocation).toBeUndefined();
  });

  it("shares one run holder with the child frame and pops every frame when the run ends", async () => {
    const seen: string[][] = [];
    const invocation = automationStudioRootInvocation(caller, { currentSubflowId: "main" }, (target, options, onExecuted) => {
      seen.push(options.invocation!.run.stack.map((frame) => `${frame.invocationId}:${frame.subflowId}`));
      expect(options.invocation?.frame).toMatchObject({ parentInvocationId: "invocation-1", callNodeId: "call", subflowId: "child", graphFlowId: "graph.child", graphRevision: 3, inputs: { query: "hello" }, cursor: { nodeId: "start", phase: "before_attempt" } });
      return runAutomationStudioGraph(target.graph, options, onExecuted);
    });
    const { saved } = await run(caller, { inputs: { parentQuery: "hello" }, invocation, subflowGraphs: source({ child }) });

    expect(saved.status).toBe("succeeded");
    expect(seen).toEqual([["invocation-1:main"]]);
    expect(invocation.run.stack).toEqual([]);
    expect(invocation.frame).toMatchObject({ invocationId: "invocation-1", subflowId: "main", graphFlowId: "graph.parent", entry: { kind: "default" } });

    const thrown = automationStudioRootInvocation(caller, {}, () => { throw new Error("runner broke"); });
    const failed = await run(caller, { inputs: { parentQuery: "hello" }, invocation: thrown, subflowGraphs: source({ child }) });
    expect(failed.saved.status).toBe("failed");
    expect(thrown.run.stack).toEqual([]);
  });

  it("refuses a call to a Subflow already running in this run", async () => {
    const loads: string[] = [];
    const selfCall = graph("graph.main", [{ id: "start", definitionId: "builtin.control.start" }, { id: "again", definitionId: CALL, parameterValues: { subflowId: "main" } }]);
    const { saved } = await run(selfCall, { currentSubflowId: "main", subflowGraphs: source({ main: { subflowId: "main", graph: selfCall, graphRevision: null } }, loads) });

    expect(saved.status).toBe("failed");
    const again = saved.attempts.find((attempt) => attempt.nodeId === "again")!;
    expect(again.failure).toMatchObject({ category: "graph_validation_or_unknown_node", code: "executor.call_subflow.cycle", retryable: false });
    expect(again.message).toBe("Subflow main is already running in this run, so calling it again from inside itself would never end.");
    expect(again.childTrace).toBeUndefined();
    expect(loads).toEqual([]);
  });

  it("refuses a child that calls back into its caller's Subflow", async () => {
    const loop: AutomationStudioSubflowGraph = { subflowId: "child", graphRevision: null, graph: graph("graph.loop", [{ id: "start", definitionId: "builtin.control.start" }, { id: "back", definitionId: CALL, parameterValues: { subflowId: "main" } }]) };
    const { saved } = await run(caller, { currentSubflowId: "main", subflowGraphs: source({ child: loop }) });

    const call = saved.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(call.status).toBe("failed");
    expect(call.childTrace?.attempts.find((attempt) => attempt.nodeId === "back")?.failure?.code).toBe("executor.call_subflow.cycle");
  });

  it("refuses a Subflow the automation does not have, and a run given no Subflows", async () => {
    const missing = await run(caller, { subflowGraphs: source({}) });
    const unknown = missing.saved.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(unknown.failure).toMatchObject({ category: "missing_router_or_subflow_target", code: "executor.call_subflow.unknown", retryable: false });
    expect(unknown.message).toBe("Subflow child could not be run: it is not a Subflow of this automation.");

    const unsourced = await run(caller, {});
    expect(unsourced.saved.attempts.find((attempt) => attempt.nodeId === "call")?.message).toBe("Subflow child could not be run: this run was given no Subflows to call.");
  });

  it("never re-runs the container when its child fails, while the child's step keeps its four attempts", async () => {
    const failing: AutomationStudioSubflowGraph = { subflowId: "child", graphRevision: null, graph: graph("graph.failing", [{ id: "start", definitionId: "builtin.control.start" }, { id: "press", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.press" } }]) };
    let dispatches = 0;
    const { saved } = await run(caller, {
      subflowGraphs: source({ child: failing }),
      delay: async () => undefined,
      effectDispatcher: () => {
        dispatches += 1;
        return { status: "failed", route: "failed", message: "Busy.", failure: { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" } };
      }
    });

    expect(saved.status).toBe("failed");
    expect(dispatches).toBe(4);
    const calls = saved.attempts.filter((attempt) => attempt.nodeId === "call");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.message).toMatch(/^Subflow child failed/);
    expect(calls[0]?.childTrace?.attempts.filter((attempt) => attempt.nodeId === "press")).toHaveLength(4);
    expect(automationStudioNodeRetryPolicy(caller, caller.nodes[1]!, {}).maxAttempts).toBe(1);
    expect(automationStudioNodeRetryPolicy(failing.graph, failing.graph.nodes[1]!, {}).maxAttempts).toBe(4);
  });

  it("routes a declared child error the call binds", async () => {
    const declared: AutomationStudioSubflowGraph = {
      subflowId: "child", graphRevision: null,
      graph: graph("graph.declared", [{ id: "start", definitionId: "builtin.control.start" }, { id: "press", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.press" } }]),
      artifact: { interface: { inputs: [], outputs: [] }, errors: [{ id: "sold-out" }] } as unknown as NonNullable<AutomationStudioSubflowGraph["artifact"]>
    };
    const routed = graph("graph.routed", [{ id: "start", definitionId: "builtin.control.start" }, { id: "call", definitionId: CALL, parameterValues: { subflowId: "child", errors: { "sold-out": "why" } } }]);
    const { executed } = await run(routed, {
      subflowGraphs: source({ child: declared }),
      delay: async () => undefined,
      effectDispatcher: () => ({ status: "failed", route: "failed", message: "Gone.", failure: { category: "action_failed", code: "web.action.gone", retryable: false, stage: "execution" } })
    });
    const call = executed.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(call.route).toBe("error.sold-out");
    expect(typeof call.outputs.why).toBe("string");
  });

  it("gives each input the value its entry holds: a literal as written, a binding as the parent's value", async () => {
    const mixed = graph("graph.mixed", [
      { id: "start", definitionId: "builtin.control.start" },
      { id: "call", definitionId: CALL, parameterValues: { subflowId: "child", inputs: { query: "written", ambient: automationNodeStateBinding("parentQuery") }, outputs: { "echo.value": "echoed", "peek.value": "peeked" } } }
    ]);
    const { saved, executed } = await run(mixed, { inputs: { parentQuery: "hello" }, subflowGraphs: source({ child }) });

    expect(saved.status).toBe("succeeded");
    // "written" is a value, never the name of a parent value to look up.
    expect(executed.values.echoed).toBe("written");
    expect(executed.values.peeked).toBe("hello");
  });

  it("fails the call before running the child when an input is bound to a value the parent never produced", async () => {
    const loads: string[] = [];
    const unbound = graph("graph.unbound", [
      { id: "start", definitionId: "builtin.control.start" },
      { id: "call", definitionId: CALL, parameterValues: { subflowId: "child", inputs: { query: automationNodeStateBinding("nobodyMadeThis") } } }
    ]);
    const { saved } = await run(unbound, { subflowGraphs: source({ child }, loads) });

    const call = saved.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(call.failure?.code).toBe("executor.parameter.unresolved_state_path");
    expect(call.childTrace).toBeUndefined();
    expect(loads).toEqual([]);
  });

  it("reads a declared output from where its binding points in the child, a node named by its key", async () => {
    const keyed: AutomationStudioSubflowGraph = {
      subflowId: "child", graphRevision: null,
      graph: graph("graph.keyed", [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "node.minted.s1", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") }, metadata: { bootstrapSymbolicKey: "s1" } }
      ]),
      artifact: { interface: { inputs: [{ id: "query", name: "query", valueType: { kind: "unknown" } }], outputs: [
        { id: "answer", name: "answer", valueType: { kind: "unknown" }, metadata: { binding: automationNodeStateBinding("$node.s1.value") } },
        { id: "never", name: "never", valueType: { kind: "unknown" }, metadata: { binding: automationNodeStateBinding("$node.s9.value") } }
      ] }, errors: [] } as unknown as NonNullable<AutomationStudioSubflowGraph["artifact"]>
    };
    const calling = graph("graph.calling", [
      { id: "start", definitionId: "builtin.control.start" },
      { id: "call", definitionId: CALL, parameterValues: { subflowId: "child", inputs: { query: "q" }, outputs: { answer: "answer" } } }
    ]);
    const { saved, executed } = await run(calling, { subflowGraphs: source({ child: keyed }) });

    expect(saved.status).toBe("succeeded");
    const call = executed.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(call.outputs).toEqual({ answer: "q", never: null });
    expect(executed.values["call.answer"]).toBe("q");
  });
});
