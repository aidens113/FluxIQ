// t905 C1: one frame's node-invocation events, driven directly. Engine dispatch paths are covered in
// `node-execution/tests/input-use.test.ts`; these pin the controller's own contract.
import { describe, expect, it } from "vitest";
import type { AutomationStudioInputUseRead } from "../../read.ts";
import type { AutomationStudioInputUseLocation } from "../../location.ts";
import { AutomationStudioInputUseNodeController, type AutomationStudioInputUseNodeCapture, type AutomationStudioInputUseNodeLease, type AutomationStudioInputUseNodeRequest } from "../index.ts";

type NodeOpen = (capture: AutomationStudioInputUseNodeCapture, signal?: AbortSignal) => Promise<AutomationStudioInputUseRead<AutomationStudioInputUseNodeLease>>;
const location: AutomationStudioInputUseLocation = Object.freeze({ invocationId: "invocation.synthetic", graphFlowId: "flow.synthetic", graphRevision: null, subflowId: null });
const entry = Object.freeze({ location, reference: Object.freeze({ ownerId: "input.owner.synthetic", bindingId: "input.binding.synthetic", revision: 1 }) });
const reference = { ownerId: "node.owner.synthetic", bindingId: "node.binding.synthetic", revision: 1 };

function request(values: AutomationStudioInputUseNodeRequest["values"], signal?: AbortSignal): AutomationStudioInputUseNodeRequest {
  return { consumer: "builtin", nodeId: "node", attemptId: "node.attempt.1", occurrence: Object.freeze({}), values, refreshed: false, ...(signal ? { signal } : {}) };
}

function lease(capture: AutomationStudioInputUseNodeCapture, count: { closes: number }, current: () => Promise<AutomationStudioInputUseRead<true>> = async () => ({ status: "bound", value: true })): AutomationStudioInputUseNodeLease {
  const held = structuredClone(capture.values);
  return { reference, executionCopy: () => structuredClone(held), verifyCurrent: current, close: () => { count.closes += 1; } };
}

function controller(node: NodeOpen | undefined, lifetime = new AbortController(), owned: () => "clear" | "captured" | "unavailable" = () => "clear") {
  return new AutomationStudioInputUseNodeController(node ? { node } : undefined, lifetime.signal, owned);
}

describe("node-invocation controller (t905 C1)", () => {
  it("runs a refused callback synchronously on the original pair: no copy and no await", () => {
    const values = { inputs: { item: { nested: "synthetic" } }, parameters: {} }, token = Symbol("returned");
    for (const [nodes, at] of [[controller(undefined), entry], [controller(async () => ({ status: "unknown", code: "stale" })), undefined],
      [controller(async () => ({ status: "unknown", code: "stale" }), undefined, () => "captured"), entry]] as const) {
      let received: unknown;
      const result = nodes.invoke(at, request(values), pair => {
        received = pair;
        return token;
      });
      expect(result).toBe(token);
      expect(received).toBe(values);
    }
  });

  it("hands the callback the lease copy, not the caller's later-mutated original, and seals that callback", async () => {
    const values = { inputs: { item: { nested: "before" } }, parameters: { text: "kept" } }, count = { closes: 0 };
    const nodes = controller(async capture => {
      values.inputs.item.nested = "after";
      values.parameters.text = "changed";
      return { status: "bound", value: lease(capture, count) };
    });
    let received: unknown;
    await nodes.invoke(entry, request(values), pair => { received = pair; });
    expect(received).toEqual({ inputs: { item: { nested: "before" } }, parameters: { text: "kept" } });
    expect(received).not.toBe(values);
    expect(nodes.observations()).toEqual([expect.objectContaining({ status: "sealed", coverage: "node_invocation_values", reference, location, consumer: "builtin", nodeId: "node" })]);
    expect(count.closes).toBe(1);
  });

  it.each([
    ["a malformed answer", async () => null as unknown as AutomationStudioInputUseRead<AutomationStudioInputUseNodeLease>, "authority_failed"],
    ["a thrown authority", async () => { throw new Error("synthetic-authority-failure"); }, "authority_failed"],
    ["a bound lease with no value", async () => ({ status: "bound", value: undefined as unknown as AutomationStudioInputUseNodeLease }), "authority_failed"],
    ["an invalid reference", async (capture: AutomationStudioInputUseNodeCapture) => ({ status: "bound", value: { ...lease(capture, { closes: 0 }), reference: { ownerId: "", bindingId: "x", revision: 1 } } }), "invalid_reference"]
  ] as const)("keeps %s unknown and still runs the original pair", async (_label, open, code) => {
    const values = { inputs: {}, parameters: { text: "synthetic" } };
    const nodes = controller(open as NodeOpen);
    let received: unknown;
    await nodes.invoke(entry, request(values), pair => { received = pair; });
    expect(received).toBe(values);
    expect(nodes.observations()).toEqual([expect.objectContaining({ status: "unknown", code })]);
  });

  it("leaves the callback's outcome alone when its lease fails to close, and closes it exactly once", async () => {
    let closes = 0;
    const nodes = controller(async capture => ({ status: "bound", value: { ...lease(capture, { closes: 0 }), close: () => {
      closes += 1;
      throw new Error("synthetic-close-failure");
    } } }));
    await expect(nodes.invoke(entry, request({ inputs: {}, parameters: {} }), () => "result")).resolves.toBe("result");
    nodes.close();
    expect(closes).toBe(1);
    expect(nodes.observations()).toEqual([expect.objectContaining({ status: "unknown", code: "authority_failed" })]);
  });

  it("propagates the callback's own throw after the lease closes", async () => {
    const count = { closes: 0 }, thrown = new Error("synthetic-callback-failure");
    const nodes = controller(async capture => ({ status: "bound", value: lease(capture, count) }));
    await expect(nodes.invoke(entry, request({ inputs: {}, parameters: {} }), () => { throw thrown; })).rejects.toBe(thrown);
    expect(count.closes).toBe(1);
  });

  it("gates cancellation before the callback with the exact reason, records the gate, and closes a late lease once", async () => {
    const run = new AbortController(), reason = new Error("synthetic-cancel"), count = { closes: 0 };
    let arrive!: (read: AutomationStudioInputUseRead<AutomationStudioInputUseNodeLease>) => void, captured!: AutomationStudioInputUseNodeCapture;
    const nodes = controller(capture => {
      captured = capture;
      return new Promise(done => { arrive = done; });
    });
    let invoked = 0;
    const pending = nodes.invoke(entry, request({ inputs: {}, parameters: {} }, run.signal), () => { invoked += 1; });
    await Promise.resolve();
    run.abort(reason);
    await expect(pending).rejects.toBe(reason);
    arrive({ status: "bound", value: lease(captured, count) });
    await new Promise<void>(done => setImmediate(done));
    expect(invoked).toBe(0);
    expect(count.closes).toBe(1);
    expect(nodes.observations()).toEqual([expect.objectContaining({ status: "unknown", code: "cancelled" })]);
  });

  it("keeps the callback's result when cancelled during the final freshness check, and leaves the event unknown", async () => {
    const run = new AbortController(), count = { closes: 0 };
    let checks = 0;
    const nodes = controller(async capture => ({ status: "bound", value: lease(capture, count, async () => {
      checks += 1;
      if (checks === 1) return { status: "bound", value: true };
      run.abort(new Error("synthetic-cancel-after-callback"));
      return await new Promise<never>(() => {});
    }) }));
    await expect(nodes.invoke(entry, request({ inputs: {}, parameters: {} }, run.signal), () => "landed")).resolves.toBe("landed");
    expect(count.closes).toBe(1);
    expect(nodes.observations()).toEqual([expect.objectContaining({ status: "unknown", code: "cancelled" })]);
  });

  it("closes a held lease once when the frame closes during the callback, and never seals it", async () => {
    const count = { closes: 0 }, lifetime = new AbortController();
    const nodes = controller(async capture => ({ status: "bound", value: lease(capture, count) }), lifetime);
    await nodes.invoke(entry, request({ inputs: {}, parameters: {} }), () => {
      lifetime.abort(new Error("input_use.controller_closed"));
      nodes.close();
    });
    expect(count.closes).toBe(1);
    expect(nodes.observations()).toEqual([expect.objectContaining({ status: "unknown", code: "session_closed" })]);
  });

  it("withdraws every seal when the frame's own entry is no longer sealed at publication", async () => {
    const nodes = controller(async capture => ({ status: "bound", value: lease(capture, { closes: 0 }) }));
    await nodes.invoke(entry, request({ inputs: {}, parameters: {} }), () => undefined);
    expect(nodes.observations()[0]).toMatchObject({ status: "sealed" });
    expect(nodes.observations(false)).toEqual([expect.objectContaining({ status: "unknown", code: "entry_unverified" })]);
  });

  it("fixes an event's labels when it begins, whatever later happens to the request object", async () => {
    const nodes = controller(async capture => ({ status: "bound", value: lease(capture, { closes: 0 }) }));
    const asked = request({ inputs: {}, parameters: {} }) as { -readonly [K in keyof AutomationStudioInputUseNodeRequest]: AutomationStudioInputUseNodeRequest[K] };
    await nodes.invoke(entry, asked, () => {
      asked.nodeId = "forged";
      asked.consumer = "native_callback";
    });
    expect(nodes.observations()).toEqual([expect.objectContaining({ nodeId: "node", consumer: "builtin", attemptId: "node.attempt.1" })]);
    expect(Object.isFrozen(nodes.observations()[0])).toBe(true);
  });
});
