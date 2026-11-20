import { describe, expect, it } from "vitest";
import { automationNodeStateBinding } from "../../../../components/automation/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";
import { automationStudioChildInvocation, type AutomationStudioInvocationOptions } from "../../frames/index.ts";
import { AutomationStudioGraphInputUseSession, type AutomationStudioInputUseAuthority, type AutomationStudioInputUseFrameCapture, type AutomationStudioInputUseChildCapture } from "../../input-use/index.ts";
import { automationStudioCallAcrossBoundary, type AutomationStudioCallBoundaryRequest } from "../index.ts";

const childFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.synthetic-child", ownerKind: "task", ownerId: "task.synthetic", name: "Child", createdAt: 1, updatedAt: 1,
  nodes: [{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("item") } }, { id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.inspect" } }],
  edges: [{ id: "echo.act", sourceNodeId: "echo", sourcePortId: "success", targetNodeId: "act", targetPortId: "in" }]
};
const parentFlow: AutomationStudioFlowDocument = { ...childFlow, flowId: "flow.synthetic-parent", nodes: [{ id: "call", definitionId: "synthetic.call" }], edges: [] };
const contract: AutomationStudioCallBoundaryRequest["contract"] = { interface: { inputs: [
  { id: "query", name: "Query", valueType: { kind: "string" }, defaultValue: "default" },
  { id: "zero", name: "Zero", valueType: { kind: "number" }, defaultValue: 0 },
  { id: "flag", name: "Flag", valueType: { kind: "boolean" }, defaultValue: true },
  { id: "nullable", name: "Nullable", valueType: { kind: "json" }, defaultValue: "fallback" },
  { id: "item", name: "Item", valueType: { kind: "json" } }
], outputs: [] }, errors: [] };
const rawItem = { id: "synthetic-row", handle: "synthetic-private-handle", evidence: { tag: "synthetic-private-evidence" }, $minted: "synthetic-minted" };

async function runBoundary(options: { refuseChild?: boolean; failFirst?: boolean; mutate?: (options: AutomationStudioGraphExecutionOptions) => void } = {}) {
  const captures: AutomationStudioInputUseFrameCapture[] = [], children: AutomationStudioInputUseChildCapture[] = [];
  const traces: AutomationStudioGraphExecutionTrace[] = [], executed: AutomationStudioGraphExecutionTrace[] = [];
  const frames: AutomationStudioInvocationOptions[] = [], ports: AutomationStudioGraphExecutionOptions["inputUse"][] = [], signals: AbortSignal[] = [];
  const authoritySignals: Array<AbortSignal | undefined> = [], closed: string[] = [];
  let attempt = 0;
  const authority: AutomationStudioInputUseAuthority = {
    open: async (capture, signal) => {
      captures.push(capture);
      authoritySignals.push(signal);
      const held = structuredClone(capture.values);
      return { status: "bound", value: { reference: { ownerId: "synthetic-owner", bindingId: `synthetic-binding-${captures.length}`, revision: 1 },
        executionCopy: () => structuredClone(held), verifyCurrent: async () => ({ status: "bound", value: true }), close: () => { closed.push(capture.location.invocationId); } } };
    },
    child: async capture => {
      children.push(capture);
      return options.refuseChild ? { status: "unknown", code: "producer_unverified" } : { status: "bound", value: authority };
    }
  };
  const session = new AutomationStudioGraphInputUseSession(authority);
  const saved = await runAutomationStudioGraph(parentFlow, {
    inputs: { ambient: "parent-only" }, inputUse: session.port, delay: async () => undefined,
    effectDispatcher: () => options.failFirst && attempt === 1
      ? { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "synthetic.refusal", retryable: false, stage: "execution", effect: "unacted" } }
      : { status: "success", route: "success", outputs: {} },
    compositeExecutor: async ({ options: parentOptions }) => {
      const performed = new WeakMap<AutomationStudioGraphExecutionTrace, AutomationStudioGraphExecutionTrace>();
      return await automationStudioCallAcrossBoundary({ contract,
        bindings: { inputBindings: [{ targetPortId: "item", valueKey: "selected" }, { targetPortId: "flag", valueKey: "flag" }, { targetPortId: "nullable", valueKey: "nullable" }] },
        callInputs: { selected: structuredClone(rawItem), flag: false, nullable: null }, parentOptions, maxAttempts: options.failFirst ? 2 : 1,
        frame: inputs => {
          const frame = automationStudioChildInvocation(parentOptions.invocation, { callNodeId: "call", subflowId: null, graph: childFlow, graphRevision: null, inputs });
          if (frame) frames.push(frame);
          return frame;
        },
        runChild: async childOptions => {
          attempt += 1;
          ports.push(childOptions.inputUse);
          signals.push(childOptions.signal!);
          options.mutate?.(childOptions);
          const trace = await runAutomationStudioGraph(childFlow, childOptions, (real, saved) => {
            executed.push(real);
            performed.set(saved, real);
          });
          traces.push(trace);
          return trace;
        },
        executedTrace: saved => performed.get(saved) ?? saved,
        failedMessage: "Synthetic child failed."
      });
    }
  });
  return { saved, captures, children, traces, executed, frames, ports, signals, authoritySignals, closed, session };
}

describe("private input-use handoff across the typed child boundary", () => {
  it("keeps ordinary no-port child input consumption ahead of a caller's next microtask mutation", async () => {
    const selected = { value: "before" };
    let consumed: unknown;
    const running = automationStudioCallAcrossBoundary({ contract, bindings: { inputBindings: [{ targetPortId: "item", valueKey: "selected" }] },
      callInputs: { selected }, parentOptions: {}, maxAttempts: 1, frame: () => undefined,
      runChild: options => {
        consumed = structuredClone(options.inputs?.item);
        return Promise.resolve({ status: "succeeded", startedAt: 1, finishedAt: 2, attempts: [], values: {}, effects: [] });
      }, executedTrace: saved => saved, failedMessage: "Synthetic child failed." });
    queueMicrotask(() => { selected.value = "after"; });
    const crossed = await running;
    expect(crossed.childTrace.status).toBe("succeeded");
    expect(consumed).toEqual({ value: "before" });
    expect(selected.value).toBe("after");
  });

  it("strips a foreign input-use capability from childOverrides when no parent fork exists", async () => {
    const foreign = new AutomationStudioGraphInputUseSession({ open: async capture => ({ status: "bound", value: {
      reference: { ownerId: "foreign-owner", bindingId: "foreign-binding", revision: 1 }, executionCopy: () => structuredClone(capture.values),
      verifyCurrent: async () => ({ status: "bound", value: true }), close: () => {}
    } }), child: async () => ({ status: "unknown", code: "producer_unverified" }) });
    const overrides = { currentSubflowId: "child", inputUse: foreign.port };
    let seen: AutomationStudioGraphExecutionOptions["inputUse"];
    const crossed = await automationStudioCallAcrossBoundary({ contract, bindings: { inputBindings: [{ targetPortId: "item", valueKey: "selected" }] }, callInputs: { selected: structuredClone(rawItem) },
      parentOptions: {}, childOverrides: overrides, maxAttempts: 1, frame: () => undefined,
      runChild: async childOptions => {
        seen = childOptions.inputUse;
        return await runAutomationStudioGraph({ ...childFlow, nodes: childFlow.nodes.slice(0, 1), edges: [] }, childOptions);
      }, executedTrace: saved => saved, failedMessage: "Synthetic child failed." });
    expect(crossed.childTrace.status).toBe("succeeded");
    expect(seen).toBeUndefined();
    expect(foreign.read(crossed.childTrace)).toEqual({ status: "unknown", code: "unobserved" });
  });

  it("seals full actual defaults and bindings while preserving public child projection", async () => {
    const run = await runBoundary();
    expect(run.saved.status).toBe("succeeded");
    expect(run.captures).toHaveLength(2);
    const expected = { query: "default", zero: 0, flag: false, nullable: null, item: rawItem };
    expect(run.captures[1]?.values).toEqual(expected);
    expect(run.children[0]?.boundary.inputs).toEqual(expected);
    expect(run.children[0]?.boundary.declaredInputDefaults).toEqual({ query: "default", zero: 0, flag: true, nullable: "fallback" });
    expect(run.children[0]?.boundary.bindings.inputBindings).toHaveLength(3);
    expect(run.executed[0]?.values["echo.value"]).toEqual(rawItem);
    expect(run.executed[0]?.values.ambient).toBeUndefined();
    expect(run.frames[0]?.frame.inputs.item).toEqual({ id: "synthetic-row" });
    expect(run.session.read(run.traces[0]!)).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
    expect(run.authoritySignals[1]).toBe(run.signals[0]);
    expect(run.closed).toHaveLength(2);
    expect(run.frames[0]?.run.stack).toEqual([]);
    expect(JSON.stringify(run.session)).not.toContain("synthetic-private-handle");
  });

  it("detects input replacement after the raw handoff and keeps ordinary child execution", async () => {
    const run = await runBoundary({ mutate: options => { options.inputs!.item = { id: "synthetic-row", handle: "changed" }; } });
    expect(run.saved.status).toBe("succeeded");
    expect(run.executed[0]?.values["echo.value"]).toEqual({ id: "synthetic-row", handle: "changed" });
    expect(run.captures).toHaveLength(1);
    expect(run.session.read(run.traces[0]!)).toEqual({ status: "unknown", code: "handoff_mismatch" });
  });

  it("never uses the parent's port as a replacement for an unknown child authority", async () => {
    const run = await runBoundary({ refuseChild: true });
    expect(run.saved.status).toBe("succeeded");
    expect(run.captures).toHaveLength(1);
    expect(run.ports[0]).not.toBe(run.session.port);
    expect(run.session.read(run.traces[0]!)).toEqual({ status: "unknown", code: "producer_unverified" });
    expect(run.session.read(run.saved)).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
  });

  it("gives whole-child attempts distinct invocation controllers and actual bounded signals", async () => {
    const run = await runBoundary({ failFirst: true });
    expect(run.saved.status).toBe("succeeded");
    expect(run.traces.map(trace => trace.status)).toEqual(["failed", "succeeded"]);
    expect(run.ports).toHaveLength(2);
    expect(run.ports[0]).not.toBe(run.ports[1]);
    expect(run.ports[0]).not.toBe(run.session.port);
    expect(run.children).toHaveLength(2);
    expect(run.children[0]?.child.invocationId).not.toBe(run.children[1]?.child.invocationId);
    expect(run.authoritySignals.slice(1)).toEqual(run.signals);
    expect(run.closed).toHaveLength(3);
    expect(run.traces.map(trace => run.session.read(trace))).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "sealed", coverage: "graph_entry_inputs" })
    ]));
  });
});
