import { expect, it } from "vitest";
import { createExecutionAdmissionAuthority } from "../../../execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../execution-admission/tests/source.ts";
import { ExecutionObservationSource } from "../../source.ts";
import { invokeExecutionCallbackRoot } from "../invoke.ts";
import type { ExecutionCallbackRootLifecycle } from "../lifecycle.ts";

async function fixture() {
  const store = new AdmissionTestPersistence(), scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scope = await assembly.openScope(scopes.issue());
  const source = new AdmissionTestSource(scope, "actual.root.owner");
  const callbacks = new ExecutionObservationSource(scope, "actual.callback.owner");
  source.delegatesTo.push(callbacks.owner);
  const ports = assembly.registerSource(source);
  callbacks.connect(assembly.registerSource(callbacks.registration([])));
  const origin = source.origin();
  const grant = ports.issuer.fromOrdinaryAdmission(source.admit(origin));
  const lifecycle: ExecutionCallbackRootLifecycle = {
    callbacks,
    reserve: signal => assembly.consumer.reserve(scope, grant, signal),
    finish: root => ports.producer.finish(root, source.complete(origin)),
    unverified: root => ports.producer.observe(root, source.prove(origin, { kind: "returned_unverified", completionDigest: "actual.returned" })),
    interrupted: (root, reason) => ports.producer.interrupted(root, reason),
    release: reservation => assembly.consumer.release(reservation)
  };
  return { store, assembly, scope, callbacks, lifecycle };
}

it("binds an original entered child before the actual typed method without leaking its arguments", async () => {
  const h = await fixture(), order: string[] = [];
  const receiver = { calls: 0 }, argument = { payload: "root-argument-must-stay-private" }, result = {};
  async function original(this: typeof receiver, input: typeof argument) {
    expect(this).toBe(receiver);
    expect(input).toBe(argument);
    order.push("called");
    this.calls += 1;
    return result;
  }
  h.callbacks.manage({ receiver, callback: original, contract: "no_direct_effects" });
  const lifecycle: ExecutionCallbackRootLifecycle = { ...h.lifecycle, prepared(context) {
    order.push("entered");
    const entry = h.assembly.entryBridge.read(context.parent);
    expect(entry.sourceOwner).toBe(h.callbacks.owner);
    expect(entry.row.parentId).toBeDefined();
    expect(entry.lifecycle).toBe("open");
    expect(entry.reservationActive).toBe(true);
  } };
  await expect(invokeExecutionCallbackRoot(lifecycle, { receiver, callback: original, args: [argument] })).resolves.toBe(result);
  expect(order).toEqual(["entered", "called"]);
  expect(receiver.calls).toBe(1);
  expect((await h.assembly.consumer.inspect(h.scope)).state).toBe("clear");
  expect(JSON.stringify(h.store.requests)).not.toContain(argument.payload);
});

it("preserves an unsupported first return without certifying its open child", async () => {
  const h = await fixture(), result = {};
  await expect(invokeExecutionCallbackRoot(h.lifecycle, { receiver: undefined, callback: async () => result, args: [] })).resolves.toBe(result);
  expect((await h.assembly.consumer.inspect(h.scope)).state).toBe("unverified");
});

it("awaits the pinned preparation and authentic original root before invoking the pinned callback", async () => {
  const h = await fixture(), order: string[] = [], result = {};
  let resume!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  const original = async () => {
    order.push("callback");
    return result;
  };
  h.callbacks.manage({ receiver: undefined, callback: original, contract: "no_direct_effects" });
  const lifecycle: ExecutionCallbackRootLifecycle = { ...h.lifecycle, async prepared(context, root) {
    expect(this).toBe(lifecycle);
    const parent = h.assembly.entryBridge.read(root);
    expect(parent.row.parentId).toBeUndefined();
    expect(h.assembly.entryBridge.read(context.parent).row.parentId).toBe(parent.row.entryId);
    order.push("preparing");
    entered();
    await waiting;
    order.push("prepared");
  } };
  const call = { receiver: undefined, callback: original, args: [] as [] };
  const running = invokeExecutionCallbackRoot(lifecycle, call);
  await Promise.race([ready, running.then(() => { throw new Error("test.callback_finished_before_preparation"); })]);
  expect(order).toEqual(["preparing"]);
  lifecycle.prepared = async () => { throw new Error("test.replaced_preparation"); };
  call.callback = async () => { throw new Error("test.replaced_callback"); };
  resume();
  await expect(running).resolves.toBe(result);
  expect(order).toEqual(["preparing", "prepared", "callback"]);
});

it("preserves asynchronous preparation failure and never calls the implementation", async () => {
  const h = await fixture(), failure = new Error("test.actual_preparation_failure");
  let called = 0;
  const lifecycle: ExecutionCallbackRootLifecycle = { ...h.lifecycle, async prepared() {
    await Promise.resolve();
    throw failure;
  } };
  await expect(invokeExecutionCallbackRoot(lifecycle, { receiver: undefined, callback: async () => { called++; }, args: [] })).rejects.toBe(failure);
  expect(called).toBe(0);
  expect((await h.assembly.consumer.inspect(h.scope)).state).not.toBe("clear");
});

it("does not certify an orchestration frame whose required engine descendant never entered", async () => {
  const h = await fixture(), result = {}, receiver = {};
  const original = async () => result;
  h.callbacks.manage({ receiver, callback: original, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => h.callbacks.frameCompletion(invocation, h.callbacks.owner) });
  await expect(invokeExecutionCallbackRoot(h.lifecycle, { receiver, callback: original, args: [] })).resolves.toBe(result);
  expect((await h.assembly.consumer.inspect(h.scope)).state).toBe("unverified");
});

it("retains the original callback failure when releasing its reservation also fails", async () => {
  const h = await fixture(), original = new Error("actual callback failure");
  const releaseFailure = h.store.failNext("release");
  let caught: unknown;
  try {
    await invokeExecutionCallbackRoot(h.lifecycle, { receiver: undefined, callback: async () => { throw original; }, args: [] });
  } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(AggregateError);
  const errors = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(errors)] : [error];
  expect(errors(caught)).toContain(original);
  expect(errors(caught)).toContain(releaseFailure);
});
