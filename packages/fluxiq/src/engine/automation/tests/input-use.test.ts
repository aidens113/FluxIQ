import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { automationNodeStateBinding } from "../../../components/automation/index.ts";
import { runAutomationStudioGraph, resumeAutomationStudioGraphRun, type AutomationStudioGraphRunSeed } from "../index.ts";
import { runWithAutomationStudioRunSecrets } from "../../../runtime/run-secrets/index.ts";
import { automationStudioRootInvocation } from "../frames/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../index.ts";
import type { AutomationStudioFlowDocument } from "./fixture-contracts.ts";
import { AutomationStudioGraphInputUseSession, type AutomationStudioInputUseAuthority, type AutomationStudioInputUseFrameCapture, type AutomationStudioInputUseLease } from "../input-use/index.ts";

const reference = { ownerId: "input.owner.synthetic", bindingId: "input.binding.synthetic", revision: 1 };
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.input-use", ownerKind: "task", ownerId: "task.input-use", name: "Input use", createdAt: 1, updatedAt: 1,
  nodes: [{ id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }], edges: []
};

function lease(values: JsonObject, onCheck = () => {}, onClose = () => {}): AutomationStudioInputUseLease {
  const held = structuredClone(values);
  return { reference, executionCopy: () => structuredClone(held), verifyCurrent: async () => {
    onCheck();
    return { status: "bound", value: true };
  }, close: onClose };
}

function authority(open: AutomationStudioInputUseAuthority["open"]): AutomationStudioInputUseAuthority {
  return { open, child: async () => ({ status: "unknown", code: "producer_unverified" }) };
}

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("actual graph-entry input use", () => {
  it("preserves the ordinary no-port input capture before a caller's next microtask mutation", async () => {
    const inputs = { query: "before" };
    let used: unknown;
    const running = runAutomationStudioGraph(flow, { inputs }, trace => { used = trace.values["echo.value"]; });
    queueMicrotask(() => { inputs.query = "after"; });
    const saved = await running;
    expect(saved.status).toBe("succeeded");
    expect(used).toBe("before");
    expect(inputs.query).toBe("after");
  });

  it("cannot mint a seal by calling exposed preparation and trace-writing methods without a graph run", async () => {
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => ({ status: "bound", value: lease(capture.values) })));
    const fakeTrace = { status: "succeeded", attempts: [], values: {} };
    const options: AutomationStudioGraphExecutionOptions = { inputs: { query: "synthetic" } };
    const invocation = automationStudioRootInvocation(flow, options);
    invocation.run.stack.push(invocation.frame);
    const exposed = session.port as unknown as { enter?: (flowId: string, options: AutomationStudioGraphExecutionOptions, inputs: JsonObject, active: boolean, seeded: boolean) => Promise<{
      inputs: JsonObject | undefined; initialize(inputs: JsonObject): JsonObject; complete(...traces: object[]): Promise<void>; close(): void;
    }> };
    try {
      if (typeof exposed.enter === "function") {
        const frame = await exposed.enter(flow.flowId, { ...options, invocation }, options.inputs!, false, false);
        frame.initialize(frame.inputs!);
        await frame.complete(fakeTrace);
        frame.close();
      }
      expect(session.read(fakeTrace).status).toBe("unknown");
      expect("enter" in session.port).toBe(false);
      expect("complete" in session.port).toBe(false);
      expect("initialize" in session.port).toBe(false);
    } finally {
      invocation.run.stack.pop();
      session.close();
    }
  });

  it("seals the full dictionary that initializes the real runner, without persisting its private values", async () => {
    const captures: AutomationStudioInputUseFrameCapture[] = [];
    let checks = 0, closed = 0;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      captures.push(capture);
      return { status: "bound", value: lease(capture.values, () => { checks += 1; }, () => { closed += 1; }) };
    }));
    let executed: AutomationStudioGraphExecutionTrace | undefined;
    const saved = await runAutomationStudioGraph(flow, { inputs: { query: "synthetic-private-input", unread: { count: 0, flag: false, absent: null } }, inputUse: session.port }, trace => { executed = trace; });
    expect(saved.status).toBe("succeeded");
    expect(executed?.values["echo.value"]).toBe("synthetic-private-input");
    expect(captures.map(capture => capture.values)).toEqual([{ query: "synthetic-private-input", unread: { count: 0, flag: false, absent: null } }]);
    expect(session.read(saved)).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs", reference });
    expect(session.read(executed!)).toEqual(session.read(saved));
    expect(checks).toBeGreaterThanOrEqual(2);
    expect(closed).toBe(1);
    expect(JSON.stringify(session.read(saved))).not.toContain("synthetic-private-input");
    expect(JSON.stringify(saved)).not.toContain("synthetic-private-input");
  });

  it("executes from the prepared lease copy when the caller mutates its original during authority work", async () => {
    const original: JsonObject = { query: { nested: "before" } };
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      const held = lease(capture.values);
      original.query = { nested: "after" };
      await Promise.resolve();
      return { status: "bound", value: held };
    }));
    let used: unknown;
    const saved = await runAutomationStudioGraph(flow, { inputs: original, inputUse: session.port }, trace => { used = trace.values["echo.value"]; });
    expect(used).toEqual({ nested: "before" });
    expect(original.query).toEqual({ nested: "after" });
    expect(session.read(saved).status).toBe("sealed");
  });

  it("invalidates a consumed entry when its producer changes before completion without another observation", async () => {
    let current = true, checks = 0, closed = 0;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => ({ status: "bound", value: {
      ...lease(capture.values, () => {}, () => { closed += 1; }),
      verifyCurrent: async () => {
        checks += 1;
        return current ? { status: "bound", value: true } : { status: "unknown", code: "producer_unverified" };
      }
    } })));
    const acted: AutomationStudioFlowDocument = { ...flow, nodes: [{ id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.inspect" } }] };
    const saved = await runAutomationStudioGraph(acted, { inputs: { query: "same" }, inputUse: session.port, effectDispatcher: () => {
      current = false;
      return { status: "success", route: "success", outputs: {} };
    } });
    expect(saved.status).toBe("succeeded");
    expect(checks).toBeGreaterThanOrEqual(2);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "producer_unverified" });
    expect(closed).toBe(1);
  });

  it("refuses a different lease copy and executes with the ordinary original inputs", async () => {
    let closed = 0, used: unknown;
    const session = new AutomationStudioGraphInputUseSession(authority(async () => ({ status: "bound", value: lease({ query: "substitution" }, () => {}, () => { closed += 1; }) })));
    const saved = await runAutomationStudioGraph(flow, { inputs: { query: "original" }, inputUse: session.port }, trace => { used = trace.values["echo.value"]; });
    expect(saved.status).toBe("succeeded");
    expect(used).toBe("original");
    expect(session.read(saved)).toEqual({ status: "unknown", code: "lease_mismatch" });
    expect(closed).toBe(1);
  });

  it("never retries an initially unknown authority after the graph changes its availability", async () => {
    let available = false, opens = 0;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      opens += 1;
      return available ? { status: "bound", value: lease(capture.values) } : { status: "unknown", code: "producer_unverified" };
    }));
    const acted = { ...flow, nodes: [{ id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.inspect" } }] };
    const saved = await runAutomationStudioGraph(acted, { inputs: { query: "original" }, inputUse: session.port, effectDispatcher: () => {
      available = true;
      return { status: "success", route: "success", outputs: {} };
    } });
    expect(saved.status).toBe("succeeded");
    expect(available).toBe(true);
    expect(opens).toBe(1);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "producer_unverified" });
  });

  it("keeps ordinary execution when authority throws and exposes no authority error text", async () => {
    const session = new AutomationStudioGraphInputUseSession(authority(async () => { throw new Error("synthetic-private-authority-error"); }));
    const saved = await runAutomationStudioGraph(flow, { inputs: { query: "original" }, inputUse: session.port });
    expect(saved.status).toBe("succeeded");
    expect(session.read(saved)).toEqual({ status: "unknown", code: "authority_failed" });
    expect(JSON.stringify(saved)).not.toContain("synthetic-private-authority-error");
  });

  it.each([false, true])("keeps active ambient secrets unknown, with explicit shadow=%s", async shadow => {
    let opens = 0, used: AutomationStudioGraphExecutionTrace | undefined;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      opens += 1;
      return { status: "bound", value: lease(capture.values) };
    }));
    const saved = await runWithAutomationStudioRunSecrets({ query: "synthetic-ambient", hidden: "synthetic-hidden" }, () => runAutomationStudioGraph(flow,
      { ...(shadow ? { inputs: { query: "explicit" } } : {}), inputUse: session.port }, trace => { used = trace; }));
    expect(saved.status).toBe("succeeded");
    expect(used?.values["echo.value"]).toBe(shadow ? "explicit" : "synthetic-ambient");
    expect(used?.values.hidden).toBe("synthetic-hidden");
    expect(opens).toBe(0);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "active_secrets" });
    expect(JSON.stringify(saved)).not.toContain("synthetic-ambient");
    expect(JSON.stringify(session)).not.toContain("synthetic-hidden");
  });

  it("does not infer secrecy authority from the absence of ambient secrets or equal withheld markers", async () => {
    let opens = 0;
    const session = new AutomationStudioGraphInputUseSession(authority(async () => {
      opens += 1;
      return { status: "unknown", code: "secrecy_unverified" };
    }));
    const saved = await runAutomationStudioGraph(flow, { inputs: { query: "[WITHHELD]" }, inputUse: session.port });
    expect(saved.status).toBe("succeeded");
    expect(opens).toBe(1);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "secrecy_unverified" });
  });

  it("preserves unsupported ordinary input execution instead of dropping the unsupported member", async () => {
    let opens = 0, used: unknown;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      opens += 1;
      return { status: "bound", value: lease(capture.values) };
    }));
    const saved = await runAutomationStudioGraph(flow, { inputs: { query: "ordinary", unsupported: Number.NaN }, inputUse: session.port }, trace => { used = trace.values.unsupported; });
    expect(saved.status).toBe("succeeded");
    expect(used).toBeNaN();
    expect(opens).toBe(0);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "unsupported_input" });
  });

  it("keeps seeded continuation state unverified without altering its restored inputs or route", async () => {
    let opens = 0, used: unknown;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      opens += 1;
      return { status: "bound", value: lease(capture.values) };
    }));
    const resumed = { ...flow, nodes: [{ id: "start", definitionId: "builtin.control.start" }, ...flow.nodes], edges: [{ id: "start.echo", sourceNodeId: "start", targetNodeId: "echo", sourcePortId: "success", targetPortId: "in" }] };
    const seed: AutomationStudioGraphRunSeed = { startedAt: 1, stepsTaken: 1, maxSteps: 10,
      attempts: [{ attemptId: "start.attempt.1", nodeId: "start", definitionId: "builtin.control.start", startedAt: 1, finishedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] }],
      values: { query: "withheld", seeded: true }, effects: [], regionTransitions: [], variables: { later: "seed-variable" }, loops: {}, route: "success" };
    const ordinary = await resumeAutomationStudioGraphRun(resumed, { inputs: { query: "restored" }, startNodeId: "start", now: () => 2 }, structuredClone(seed));
    expect(ordinary.status, ordinary.message).toBe("succeeded");
    const saved = await resumeAutomationStudioGraphRun(resumed, { inputs: { query: "restored" }, inputUse: session.port, startNodeId: "start", now: () => 2 }, structuredClone(seed), trace => { used = trace.values["echo.value"]; });
    expect(saved.status, saved.message).toBe("succeeded");
    expect(saved).toEqual(ordinary);
    expect(used).toBe("restored");
    expect(opens).toBe(0);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "resume_state_unverified" });
  });

  it("declares entry-only coverage when a wired value overrides the Flow input at native dispatch", async () => {
    let dispatched: unknown;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => ({ status: "bound", value: lease(capture.values) })));
    const wired = { ...flow, nodes: [{ id: "source", definitionId: "builtin.data.constant", parameterValues: { value: "wired" } }, { id: "native", definitionId: "synthetic.native" }],
      edges: [{ id: "source.next", sourceNodeId: "source", targetNodeId: "native", sourcePortId: "success", targetPortId: "in" }, { id: "source.query", sourceNodeId: "source", targetNodeId: "native", sourcePortId: "value", targetPortId: "query" }] };
    const saved = await runAutomationStudioGraph(wired, { inputs: { query: "entry" }, inputUse: session.port, nativeNodeExecutor: async ({ inputs }) => {
      dispatched = inputs.query;
      return { result: { status: "success", route: "success", outputs: {} } };
    } });
    expect(saved.status).toBe("succeeded");
    expect(dispatched).toBe("wired");
    expect(session.read(saved)).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
    expect(JSON.stringify(session.read(saved))).not.toContain("whole_execution");
  });

  it("uses each opaque port for one graph and never adopts a previous trace's evidence", async () => {
    let opens = 0;
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => {
      opens += 1;
      return { status: "bound", value: lease(capture.values) };
    }));
    const first = await runAutomationStudioGraph(flow, { inputs: { query: "first" }, inputUse: session.port });
    expect(session.read(first).status).toBe("sealed");
    const second = await runAutomationStudioGraph(flow, { inputs: { query: "second" }, inputUse: session.port });
    expect(second.status).toBe("succeeded");
    expect(opens).toBe(1);
    expect(session.read(second)).toEqual({ status: "unknown", code: "port_reused" });
    expect(session.read(structuredClone(first))).toEqual({ status: "unknown", code: "unobserved" });
  });
});

describe("graph input-use cancellation and lifetime", () => {
  it("passes the actual cancellation signal and discards a lease arriving after cancellation", async () => {
    const entered = gate<void>(), opened = gate<Awaited<ReturnType<AutomationStudioInputUseAuthority["open"]>>>();
    const controller = new AbortController(), reason = { synthetic: "cancel-during-authority" };
    let forwarded: AbortSignal | undefined, closed = 0;
    const session = new AutomationStudioGraphInputUseSession(authority(async (_capture, signal) => {
      forwarded = signal;
      entered.resolve();
      return await opened.promise;
    }));
    const running = runAutomationStudioGraph(flow, { inputs: { query: "original" }, inputUse: session.port, signal: controller.signal });
    await entered.promise;
    controller.abort(reason);
    const saved = await running;
    expect(forwarded).toBe(controller.signal);
    expect(forwarded?.reason).toBe(reason);
    expect(saved.status).toBe("failed");
    expect(session.read(saved)).toEqual({ status: "unknown", code: "cancelled" });
    opened.resolve({ status: "bound", value: lease({ query: "original" }, () => {}, () => { closed += 1; }) });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(closed).toBe(1);
    expect(session.read(saved).status).toBe("unknown");
  });

  it("does not publish a seal when cancellation arrives during the final current check", async () => {
    const checking = gate<void>(), release = gate<void>();
    const controller = new AbortController(), reason = new Error("synthetic-final-check-cancel");
    let checks = 0, closed = 0;
    const signals: Array<AbortSignal | undefined> = [];
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => ({ status: "bound", value: {
      ...lease(capture.values, () => {}, () => { closed += 1; }), verifyCurrent: async signal => {
        signals.push(signal);
        checks += 1;
        if (checks === 2) {
          checking.resolve();
          await release.promise;
        }
        return { status: "bound", value: true };
      }
    } })));
    const running = runAutomationStudioGraph(flow, { inputs: { query: "original" }, inputUse: session.port, signal: controller.signal });
    await checking.promise;
    controller.abort(reason);
    const saved = await running;
    // The real graph completed; a proof check cannot replace its trace with an empty fault.
    expect(saved.status).toBe("succeeded");
    expect(saved.attempts.some(attempt => attempt.nodeId === "echo")).toBe(true);
    expect(signals).toEqual([controller.signal, controller.signal]);
    expect(controller.signal.reason).toBe(reason);
    expect(session.read(saved)).toEqual({ status: "unknown", code: "cancelled" });
    expect(closed).toBe(1);
    release.resolve();
  });

  it("closes an explicit session during pending evidence without stopping ordinary execution", async () => {
    const entered = gate<void>(), opened = gate<Awaited<ReturnType<AutomationStudioInputUseAuthority["open"]>>>();
    let closed = 0, used: unknown;
    const session = new AutomationStudioGraphInputUseSession(authority(async () => {
      entered.resolve();
      return await opened.promise;
    }));
    const running = runAutomationStudioGraph(flow, { inputs: { query: "ordinary" }, inputUse: session.port }, trace => { used = trace.values["echo.value"]; });
    await entered.promise;
    session.close();
    const saved = await running;
    expect(saved.status).toBe("succeeded");
    expect(used).toBe("ordinary");
    expect(session.read(saved)).toEqual({ status: "unknown", code: "session_closed" });
    opened.resolve({ status: "bound", value: lease({ query: "ordinary" }, () => {}, () => { closed += 1; }) });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(closed).toBe(1);
  });

  it("preserves an already-produced cancellation trace and its completed act evidence", async () => {
    const acted = { ...flow, nodes: [{ id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.inspect" } }] };
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => ({ status: "bound", value: lease(capture.values) })));
    const reason = { synthetic: "stop-after-act" };
    const execute = async (withProof: boolean) => {
      const controller = new AbortController();
      const saved = await runAutomationStudioGraph(acted, { inputs: { query: "ordinary" }, ...(withProof ? { inputUse: session.port } : {}), signal: controller.signal,
        effectDispatcher: () => {
          controller.abort(reason);
          return { status: "success", route: "success", outputs: { landed: true } };
        } });
      expect(controller.signal.aborted).toBe(true);
      expect(controller.signal.reason).toBe(reason);
      return saved;
    };
    const ordinary = await execute(false), observed = await execute(true);
    expect(ordinary.status).toBe("cancelled");
    expect(observed.status).toBe(ordinary.status);
    expect(observed.attempts).toHaveLength(ordinary.attempts.length);
    expect(observed.attempts[0]?.outputs).toEqual(ordinary.attempts[0]?.outputs);
    expect(observed.attempts[0]?.effects).toEqual(ordinary.attempts[0]?.effects);
    expect(observed.attempts[0]?.outputs.landed).toBe(true);
    expect(session.read(observed)).toEqual({ status: "unknown", code: "cancelled" });
  });

  it("removes operation cancellation listeners once all authority checks settle", async () => {
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener"), removed = vi.spyOn(controller.signal, "removeEventListener");
    const session = new AutomationStudioGraphInputUseSession(authority(async capture => ({ status: "bound", value: lease(capture.values) })));
    const saved = await runAutomationStudioGraph(flow, { inputs: { query: "ordinary" }, inputUse: session.port, signal: controller.signal });
    expect(session.read(saved).status).toBe("sealed");
    expect(added.mock.calls.length).toBeGreaterThan(0);
    expect(removed.mock.calls.length).toBe(added.mock.calls.length);
  });
});
