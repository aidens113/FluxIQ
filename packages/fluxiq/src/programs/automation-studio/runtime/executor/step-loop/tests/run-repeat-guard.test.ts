import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { runAutomationStudioGraph, resumeAutomationStudioGraphRun } from "../../graph-run.ts";
import { automationStudioChildInvocation, automationStudioRootInvocation } from "../../frames/index.ts";
import { automationStudioCallAcrossBoundary, type AutomationStudioCallBoundaryRequest } from "../../../composite-execution/index.ts";
import { runtimeRepeatHarness } from "../../../runtime-repeat/tests/harness.ts";

const CODE = "executor.runtime.unchanged_repeat";
const node = (id: string, definitionId: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode => ({ id, definitionId, parameterValues });
const edge = (from: string, to: string, route = "success", input = "in") => ({ id: `${from}.${route}.${to}.${input}`, sourceNodeId: from, sourcePortId: route, targetNodeId: to, targetPortId: input });

describe("the observed runtime repeat guard through real native execution", () => {
  it("stops before a third dispatch through canonical Constant/Branch despite changing unused command/capture IDs", async () => {
    const h = runtimeRepeatHarness();
    expect(h.native.getDefinition("builtin.data.constant")?.source.kind).toBe("builtin");
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls).toHaveLength(2);
    expect(h.captures).toHaveLength(5); // two ordinary before/after pairs, then the refused visit's before capture
    expect(new Set(h.captures.map(ref => ref.stateSnapshotId)).size).toBe(5);
    expect(trace.failure).toMatchObject({ code: CODE, retryable: false, effect: "unacted", stage: "dispatch" });
    expect(trace.attempts.filter(attempt => attempt.nodeId === "act").map(attempt => attempt.status)).toEqual(["succeeded", "succeeded", "failed"]);
    expect(h.observations).toHaveLength(5);
  });

  it("does not let a later export or an unreachable consumer of command IDs hide this cycle", async () => {
    const h = runtimeRepeatHarness();
    h.flow.nodes.push(node("export", "example.export", { value: { $state: { path: "act.commandId" } } }), node("unreachable", "example.export", { value: { $state: { path: "act.commandId" } } }));
    h.flow.edges.find(candidate => candidate.id === "end")!.targetNodeId = "export";
    h.flow.edges.push(edge("export", "done"));
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls).toHaveLength(2);
    expect(trace.failure?.code).toBe(CODE);
  });

  it("counts a self-edge as another visit and different native subjects as separate tuples", async () => {
    const direct = runtimeRepeatHarness();
    direct.flow.nodes = direct.flow.nodes.filter(candidate => candidate.id === "start" || candidate.id === "act");
    direct.flow.edges = [edge("start", "act", "next"), edge("act", "act")];
    expect((await runAutomationStudioGraph(direct.flow, direct.options)).failure?.code).toBe(CODE);
    expect(direct.calls).toHaveLength(2);
    const pair = runtimeRepeatHarness();
    pair.flow.nodes.push(node("other", "example.inspect", { subject: "subject.2" }));
    pair.flow.edges.find(candidate => candidate.id === "act-flag")!.targetNodeId = "other";
    pair.flow.edges.push(edge("other", "flag"));
    expect((await runAutomationStudioGraph(pair.flow, pair.options)).failure?.code).toBe(CODE);
    expect(pair.calls.map(call => call.parameters.subject)).toEqual(["subject.1", "subject.2", "subject.1", "subject.2"]);
  });

  it.each(["view", "resource", "target", "parameters"] as const)("preserves observed %s progress and intermediate A/B changes", async kind => {
    const h = runtimeRepeatHarness();
    h.options.maxSteps = 15;
    if (kind === "target") h.flow.nodes.find(candidate => candidate.id === "act")!.parameterValues = {};
    h.state.perform = count => {
      if (kind === "parameters") h.flow.nodes.find(candidate => candidate.id === "act")!.parameterValues!.note = count;
      else h.state[kind] = `${kind}.${count % 2}`;
      return { status: "success", route: "success", outputs: { commandId: `command.${count}` } };
    };
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls.length).toBeGreaterThan(2);
    expect(trace.failure?.code).not.toBe(CODE);
  });

  it("resets every candidate when another action changes and restores a view", async () => {
    const h = runtimeRepeatHarness();
    h.options.maxSteps = 22;
    h.flow.nodes.push(node("change", "example.inspect", { subject: "change" }), node("restore", "example.inspect", { subject: "restore" }));
    h.flow.edges.find(candidate => candidate.id === "act-flag")!.targetNodeId = "change";
    h.flow.edges.push(edge("change", "restore"), edge("restore", "flag"));
    h.state.perform = (count, parameters) => {
      if (parameters.subject === "change") h.state.view = "view.changed";
      if (parameters.subject === "restore") h.state.view = "view.unchanged";
      return { status: "success", route: "success", outputs: { commandId: `command.${count}` } };
    };
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(trace.failure?.code).not.toBe(CODE);
    expect(h.calls.filter(call => call.parameters.subject === "subject.1").length).toBeGreaterThan(2);
  });

  it("treats record-producing visits as semantic work outside the external-view proof", async () => {
    const h = runtimeRepeatHarness();
    h.options.maxSteps = 15;
    h.native.getDefinition("example.inspect")!.outputs.push({ id: "records", label: "Records", valueType: "array", role: "data" });
    h.state.perform = count => ({ status: "success", route: "success", outputs: { commandId: `command.${count}`, records: [{ sequence: count }] } });
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls.length).toBeGreaterThan(2);
    expect(trace.failure?.code).not.toBe(CODE);
  });

  it.each(["missing", "partial", "malformed", "throw"] as const)("keeps existing maxSteps behavior when observations are %s", async mode => {
    const h = runtimeRepeatHarness();
    h.options.maxSteps = 15;
    if (mode === "missing") delete h.options.hostRuntime!.observeRuntimeRepeat;
    else h.state.observe = () => {
      if (mode === "throw") throw new Error("private-host-error-sentinel");
      return mode === "partial" ? { kind: "unavailable", reason: "partial" } : { kind: "observed", resource: "missing complete coverage" };
    };
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls.length).toBeGreaterThan(2);
    expect(trace.message).toContain("Maximum step count");
    expect(JSON.stringify(trace)).not.toContain("private-host-error-sentinel");
  });

  it("does not invoke an observer-port getter and rechecks live dependencies after an awaited observation", async () => {
    const accessor = runtimeRepeatHarness();
    accessor.options.maxSteps = 15;
    let reads = 0;
    Object.defineProperty(accessor.options.hostRuntime!, "observeRuntimeRepeat", { configurable: true, get() {
      reads++;
      throw new Error("private-port-error");
    } });
    const unproven = await runAutomationStudioGraph(accessor.flow, accessor.options);
    expect(reads).toBe(0);
    expect(accessor.calls.length).toBeGreaterThan(2);
    expect(JSON.stringify(unproven)).not.toContain("private-port-error");
    const changed = runtimeRepeatHarness();
    changed.options.maxSteps = 12;
    changed.state.observe = async (request, observed) => {
      if (request.point === "before_action" && changed.calls.length === 2) changed.flow.nodes.find(candidate => candidate.id === "act")!.parameterValues!.note = "changed while observing";
      return observed;
    };
    const trace = await runAutomationStudioGraph(changed.flow, changed.options);
    expect(changed.calls.length).toBeGreaterThan(2);
    expect(trace.failure?.code).not.toBe(CODE);
  });

  it("keeps opaque observation tokens private and honors cancellation after the asynchronous observation", async () => {
    const h = runtimeRepeatHarness();
    h.state.view = "private-view-sentinel";
    h.state.resource = "private-resource-sentinel";
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(trace.failure?.code).toBe(CODE);
    expect(JSON.stringify(trace)).not.toContain("private-view-sentinel");
    expect(JSON.stringify(trace)).not.toContain("private-resource-sentinel");
    const cancelled = runtimeRepeatHarness();
    cancelled.state.observe = async (request, observed) => {
      if (request.point === "before_action" && cancelled.calls.length === 2) cancelled.controller.abort();
      return observed;
    };
    const stopped = await runAutomationStudioGraph(cancelled.flow, cancelled.options);
    expect(stopped.status).toBe("cancelled");
    expect(cancelled.calls).toHaveLength(2);
    expect(stopped.failure?.code).not.toBe(CODE);
  });

  it("does not grant terminal authority to identical public failure JSON returned by a native implementation", async () => {
    const h = runtimeRepeatHarness();
    h.flow.nodes = [h.flow.nodes[0]!, h.flow.nodes[1]!, h.flow.nodes[4]!];
    h.flow.edges = [edge("start", "act", "next"), edge("act", "done", "failed")];
    h.state.perform = () => ({ status: "failed", route: "failed", outputs: {}, message: "Two completed visits left the observed runtime unchanged; the next identical visit was not run.", failure: { category: "unexpected_state", code: CODE, retryable: false, stage: "dispatch", effect: "unacted" } });
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls).toHaveLength(1);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.some(attempt => attempt.nodeId === "done")).toBe(true);
  });

  it("does not grant private child-stop provenance to copied public trace JSON", async () => {
    const h = runtimeRepeatHarness();
    const genuine = await runAutomationStudioGraph(h.flow, h.options);
    const copied = structuredClone(genuine);
    const parent: AutomationStudioFlowDocument = { ...h.flow, nodes: [h.flow.nodes[0]!, node("call", "example.composite"), h.flow.nodes[4]!], edges: [edge("start", "call", "next"), edge("call", "done", "failed")] };
    const trace = await runAutomationStudioGraph(parent, { ...h.options, compositeExecutor: async () => ({ result: { status: "failed", route: "failed", outputs: {}, failure: { category: "unexpected_state", code: CODE, retryable: false, stage: "dispatch", effect: "unacted" } }, childTrace: copied }) });
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.nodeId).toBe("done");
  });

  it("stops actual child execution before authored whole-child retries, while forged stop JSON keeps its ordinary retries", async () => {
    const h = runtimeRepeatHarness();
    const invocation = automationStudioRootInvocation(h.flow, h.options);
    const request: AutomationStudioCallBoundaryRequest = {
      contract: { interface: { inputs: [], outputs: [] }, errors: [] }, bindings: {}, callInputs: {}, parentOptions: { ...h.options, invocation }, maxAttempts: 4,
      frame: inputs => automationStudioChildInvocation(invocation, { callNodeId: "call", subflowId: "child", graph: h.flow, graphRevision: 1, inputs }),
      runChild: childOptions => runAutomationStudioGraph(h.flow, childOptions), executedTrace: saved => saved, failedMessage: "Child failed."
    };
    const actual = await automationStudioCallAcrossBoundary(request);
    expect(h.calls).toHaveLength(2);
    expect(actual.childTrace.failure?.code).toBe(CODE);
    let attempts = 0;
    const forged = await automationStudioCallAcrossBoundary({ ...request, runChild: async () => {
      attempts++;
      return structuredClone(actual.childTrace);
    } });
    expect(attempts).toBe(4);
    expect(forged.result.failure?.code).toBe(CODE);
  });

  it("lets seven variable-controlled and wired-feedback passes finish with stable native inputs/view", async () => {
    for (const variables of [true, false]) {
      const h = runtimeRepeatHarness();
      h.options.maxSteps = 100;
      const act = h.flow.nodes[1]!;
      h.flow.nodes = [h.flow.nodes[0]!, act, ...(variables ? [node("read", "builtin.data.get-variable", { name: "counter" }), node("store", "builtin.data.set-variable", { name: "counter" })] : []), node("add", "builtin.math.add", { offset: 1 }), node("test", "builtin.logic.compare", { operator: "less-than", rightDefault: 7 }), h.flow.nodes[4]!];
      h.flow.edges = [edge("start", "act", "next"), edge("act", variables ? "read" : "add"), edge("add", variables ? "store" : "test"), edge("add", "test", "result", "left"), edge("test", "act", "true"), edge("test", "done", "false")];
      if (variables) {
        h.options.variables = { counter: 0 };
        h.flow.edges.push(edge("read", "add"), edge("read", "add", "value", "left"), edge("add", "store", "result", "value"), edge("store", "test"));
      } else {
        h.options.inputs = { left: 0 };
        h.flow.edges.push(edge("add", "add", "result", "left"));
      }
      const trace = await runAutomationStudioGraph(h.flow, h.options);
      expect(trace.status).toBe("succeeded");
      expect(h.calls).toHaveLength(7);
    }
  });

  it.each(["for-each", "repeat"])("preserves seven authored %s passes including duplicate-looking rows", async kind => {
    const h = runtimeRepeatHarness();
    h.options.maxSteps = 100;
    h.flow.nodes = [h.flow.nodes[0]!, node("each", `builtin.control.${kind}`, kind === "for-each" ? { maxIterations: 7 } : { most: 7 }), h.flow.nodes[1]!, h.flow.nodes[4]!];
    h.options.inputs = { items: Array.from({ length: 7 }, () => ({ label: "same-looking row" })) };
    h.flow.edges = [edge("start", "each", "next"), edge("each", "act", "body"), edge("act", "each"), edge("each", "done", "done"), ...(kind === "for-each" ? [edge("each", "act", "item", "item")] : [])];
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(trace.status).toBe("succeeded");
    expect(h.calls).toHaveLength(7);
  });

  it("spends four attempts and the identity-recovery boundary before counting the recovered visit", async () => {
    const h = runtimeRepeatHarness();
    let reacquires = 0;
    h.options.hostRuntime!.reacquireUnboundTarget = () => {
      reacquires++;
      return { outcome: "unmatched", reason: "unidentifiable" };
    };
    h.state.perform = count => count < 4 ? { status: "failed", route: "failed", failure: { category: "target_not_found", code: "example.stale", retryable: true, stage: "target_resolution", effect: "unacted" } } : { status: "success", route: "success", outputs: { commandId: `command.${count}` } };
    const trace = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls).toHaveLength(5);
    expect(reacquires).toBe(1);
    expect(trace.attempts.filter(attempt => attempt.nodeId === "act").slice(0, 4).map(attempt => attempt.status)).toEqual(["failed", "failed", "failed", "succeeded"]);
    expect(trace.failure?.code).toBe(CODE);
  });

  it("keeps completed-act skips and uncertain lasting outcomes ahead of the new guard", async () => {
    const h = runtimeRepeatHarness();
    h.options.maxSteps = 14;
    h.options.resolveActionEffect = action => action.definitionId === "example.inspect" ? { effectClass: "commit", permissionConsequences: ["modify_existing"] } : undefined;
    const skipped = await runAutomationStudioGraph(h.flow, h.options);
    expect(h.calls).toHaveLength(1);
    expect(skipped.attempts.some(attempt => attempt.skipped?.reason === "already_done")).toBe(true);
    expect(skipped.failure?.code).not.toBe(CODE);
    const uncertain = runtimeRepeatHarness();
    uncertain.options.resolveActionEffect = h.options.resolveActionEffect;
    uncertain.state.perform = () => ({ status: "failed", failure: { category: "action_failed", code: "example.reply_lost", retryable: true, stage: "execution", effect: "ambiguous" } });
    uncertain.options.hostRuntime!.actLanded = () => "unknown";
    const stopped = await runAutomationStudioGraph(uncertain.flow, uncertain.options);
    expect(uncertain.calls).toHaveLength(1);
    expect(stopped.failure?.code).toBe("run.outcome_uncertain");
    const denied = runtimeRepeatHarness();
    denied.native.getDefinition("example.inspect")!.safety = { requiredPermissions: ["missing-grant"] };
    const refused = await runAutomationStudioGraph(denied.flow, denied.options);
    expect(denied.calls).toHaveLength(0);
    expect(refused.attempts.find(attempt => attempt.nodeId === "act")?.failure?.code).toBe("executor.native.refused");
    expect(refused.failure?.code).not.toBe(CODE);
  });

  it("never carries private candidates across a seeded continuation or a child invocation", async () => {
    const h = runtimeRepeatHarness();
    const first = await runAutomationStudioGraph(h.flow, h.options);
    const resumed = await resumeAutomationStudioGraphRun(h.flow, { ...h.options, startNodeId: "start" }, { startedAt: first.startedAt, stepsTaken: 0, maxSteps: 35, attempts: first.attempts, values: {}, effects: [], regionTransitions: [], variables: {}, loops: {}, route: "success" });
    expect(resumed.failure?.code).toBe(CODE);
    expect(h.calls).toHaveLength(4);
    const child = runtimeRepeatHarness();
    let parentRepairs = 0;
    const parent: AutomationStudioFlowDocument = { ...child.flow, flowId: "parent", nodes: [child.flow.nodes[0]!, node("act", "builtin.control.call-subflow", { subflowId: "child" }), child.flow.nodes[4]!], edges: [edge("start", "act", "next"), edge("act", "done"), edge("act", "done", "failed")] };
    const trace = await runAutomationStudioGraph(parent, { ...child.options, currentSubflowId: "parent", retryPolicy: { maxAttempts: 1, backoffMs: [] }, repairIncident: async () => {
      parentRepairs++;
      return { kind: "none", reason: "No repair should be requested." };
    }, subflowGraphs: { load: async () => ({ subflowId: "child", graphRevision: 1, graph: child.flow }) } });
    expect(child.calls).toHaveLength(2);
    expect(trace.attempts.find(attempt => attempt.nodeId === "act")?.childTrace?.failure?.code).toBe(CODE);
    expect(trace.status).toBe("failed"); // the actual child's private provenance propagates without a parent retry/repair
    expect(trace.failure?.code).toBe(CODE);
    expect(parentRepairs).toBe(0);
  });

  it("clears old graph proof for a real in-run repair and leaves pure-only cycles to maxSteps", async () => {
    const h = runtimeRepeatHarness();
    let repairs = 0;
    h.options.retryPolicy = { maxAttempts: 1, backoffMs: [] };
    h.state.perform = count => count === 1 ? { status: "failed", route: "failed", failure: { category: "unexpected_state", code: "example.broken", retryable: false, effect: "unacted", stage: "execution" } } : { status: "success", route: "success", outputs: { commandId: `command.${count}` } };
    h.options.repairIncident = async () => {
      repairs++;
      const fixed = structuredClone(h.flow);
      fixed.nodes.find(candidate => candidate.id === "act")!.parameterValues!.subject = "repaired";
      fixed.edges.find(candidate => candidate.id === "again")!.targetNodeId = "done";
      return { kind: "overlay", repairId: "repair.1", unit: { kind: "node", nodeId: "act" }, graph: fixed };
    };
    expect((await runAutomationStudioGraph(h.flow, h.options)).status).toBe("succeeded");
    expect(repairs).toBe(1);
    expect(h.calls).toHaveLength(2);
    const pure = runtimeRepeatHarness();
    pure.options.maxSteps = 12;
    pure.flow.nodes = pure.flow.nodes.filter(candidate => candidate.id !== "act");
    pure.flow.edges = pure.flow.edges.filter(candidate => candidate.sourceNodeId !== "act" && candidate.targetNodeId !== "act");
    pure.flow.edges.push(edge("start", "flag", "next"), edge("check", "flag", "true"));
    const trace = await runAutomationStudioGraph(pure.flow, pure.options);
    expect(pure.calls).toHaveLength(0);
    expect(trace.message).toContain("Maximum step count");
  });
});
