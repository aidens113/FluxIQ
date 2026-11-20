import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { AutomationStudioInputBasisOwner, type AutomationStudioInputProducer } from "../index.ts";
import { inputBasisFixture } from "./fixtures.ts";

describe("input owner revisions", () => {
  it("reuses exact normal inputs and advances on a real change, including a return to the old value", async () => {
    const { owner, scope, writeSnapshot } = inputBasisFixture();
    const first = await owner.observe(scope, { query: "private-normal-input", count: 0 });
    expect(first.status).toBe("bound");
    if (first.status !== "bound") throw new Error("Missing first receipt");
    const same = await owner.observe(scope, { count: 0, query: "private-normal-input" });
    expect(same.status === "bound" && same.value.reference).toEqual(first.value.reference);
    const changed = await owner.observe(scope, { query: "different", count: 0 });
    expect(changed.status === "bound" && changed.value.reference.revision).toBe(2);
    const returned = await owner.observe(scope, { query: "private-normal-input", count: 0 });
    expect(returned.status === "bound" && returned.value.reference.revision).toBe(3);
    expect(writeSnapshot).toHaveBeenCalledTimes(3);
  });

  it("invalidates a published composite lease when its producer changes without re-observing it", async () => {
    const { owner, scope, producer, producerState } = inputBasisFixture();
    const first = await owner.observe(scope, { value: "same" }, [producer]);
    expect(first.status).toBe("bound");
    if (first.status !== "bound") throw new Error("Missing composite receipt");
    producerState.revision = 2;
    expect(await first.value.verifyCurrent()).toEqual({ status: "unknown", code: "producer_unverified" });
    expect(await owner.reopen(scope, first.value.reference)).toEqual({ status: "unknown", code: "producer_unverified" });
  });

  it("refuses unverified secret context before any storage operation", async () => {
    const { owner, scope, inspect, read, writeSnapshot, compareAndSwap } = inputBasisFixture();
    inspect.mockResolvedValue("raw");
    expect(await owner.observe(scope, { credential: "not-to-be-copied" })).toEqual({ status: "unknown", code: "secrecy_unverified" });
    expect(read).not.toHaveBeenCalled();
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(compareAndSwap).not.toHaveBeenCalled();
  });
});

it.each(["active", "raw", "unverified", "secret_origin"] as const)("publishes nothing for %s secrecy", async context => {
  const { owner, scope, inspect, read, writeSnapshot, compareAndSwap } = inputBasisFixture();
  inspect.mockResolvedValue(context);
  expect(await owner.observe(scope, { value: "[withheld]" })).toEqual({ status: "unknown", code: "secrecy_unverified" });
  expect(read).not.toHaveBeenCalled();
  expect(writeSnapshot).not.toHaveBeenCalled();
  expect(compareAndSwap).not.toHaveBeenCalled();
});

it("requires scope/secrecy authority and never treats memory as durable", async () => {
  const held = inputBasisFixture();
  const missingSecrecy = { ...held.ports }, missingScope = { ...held.ports };
  delete missingSecrecy.secrecy;
  delete missingScope.scopeAuthority;
  expect(await new AutomationStudioInputBasisOwner(missingSecrecy).observe(held.scope, {})).toEqual({ status: "unknown", code: "secrecy_unverified" });
  expect(await new AutomationStudioInputBasisOwner(missingScope).observe(held.scope, {})).toEqual({ status: "unknown", code: "scope_unverified" });
  expect(await new AutomationStudioInputBasisOwner({ ...held.ports, storage: { ...held.ports.storage, durable: false } }).observe(held.scope, {})).toEqual({ status: "unknown", code: "storage_unavailable" });
  expect(held.read).not.toHaveBeenCalled();
});

it("authenticates producer ownership, role and current revision rather than its shape", async () => {
  const held = inputBasisFixture();
  const unknown: AutomationStudioInputProducer = { ...held.producer, reference: { ...held.producer.reference, ownerId: "unregistered.owner" } };
  expect(await held.owner.observe(held.scope, {}, [unknown])).toEqual({ status: "unknown", code: "producer_unverified" });
  expect(await held.owner.observe(held.scope, {}, [{ ...held.producer, reference: { ...held.producer.reference, bindingId: "forged.binding" } }])).toEqual({ status: "unknown", code: "producer_unverified" });
  held.verifyProducer.mockResolvedValue({ status: "unknown", code: "stale" });
  expect(await held.owner.observe(held.scope, {}, [held.producer])).toEqual({ status: "unknown", code: "producer_unverified" });
  expect(held.read).not.toHaveBeenCalled();
  expect(held.writeSnapshot).not.toHaveBeenCalled();
  expect(held.verifyProducer).toHaveBeenCalledWith({ scope: held.scope, role: "defaults" }, held.producer.reference);
});

it("advances when an authenticated producer revision or its ordered role changes", async () => {
  const held = inputBasisFixture();
  const first = await held.owner.observe(held.scope, { value: "same" }, [held.producer]);
  expect(first.status === "bound" && first.value.reference.revision).toBe(1);
  held.producerState.revision = 2;
  const next = { ...held.producer, reference: { ...held.producer.reference, revision: 2 } };
  const second = await held.owner.observe(held.scope, { value: "same" }, [next]);
  expect(second.status === "bound" && second.value.reference.revision).toBe(2);
  const third = await held.owner.observe(held.scope, { value: "same" }, [{ ...next, role: "caller" }]);
  expect(third.status === "bound" && third.value.reference.revision).toBe(3);
});

it("isolates the caller before an async snapshot write and isolates every execution copy", async () => {
  const held = inputBasisFixture();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writing = new Promise<void>(resolve => { entered = resolve; });
  const write = held.writeSnapshot.getMockImplementation()!;
  held.writeSnapshot.mockImplementation(async (...args) => {
    entered();
    await gate;
    return await write(...args);
  });
  const values = { nested: { text: "private-original" }, list: [1, 2] };
  const pending = held.owner.observe(held.scope, values);
  await writing;
  values.nested.text = "caller mutation";
  values.list.reverse();
  release();
  const bound = await pending;
  if (bound.status !== "bound") throw new Error("Missing isolated receipt");
  expect(bound.value.executionCopy()).toEqual({ nested: { text: "private-original" }, list: [1, 2] });
  const copy = bound.value.executionCopy();
  copy.nested = "copy mutation";
  expect(bound.value.executionCopy()).toEqual({ nested: { text: "private-original" }, list: [1, 2] });
  expect(JSON.stringify(bound)).not.toContain("private-original");
  expect(Reflect.set(bound.value.reference, "revision", 99)).toBe(false);
  bound.value.close();
  expect(() => bound.value.executionCopy()).toThrow("input_basis.lease_closed");
  expect(await bound.value.verifyCurrent()).toEqual({ status: "unknown", code: "lease_closed" });
});

it.each([
  [{}, { key: null }], [{ key: false }, { key: 0 }], [{ key: 0 }, { key: "0" }],
  [{ key: [1, 2] }, { key: [2, 1] }], [{ handle: "old" }, { handle: "new" }]
] satisfies [JsonObject, JsonObject][])("keeps real JSON distinctions %j -> %j", async (first, second) => {
  const held = inputBasisFixture();
  await held.owner.observe(held.scope, first);
  const bound = await held.owner.observe(held.scope, second);
  expect(bound.status === "bound" && bound.value.reference.revision).toBe(2);
});

it("rejects unsupported data without invoking accessors or serialization hooks", async () => {
  const held = inputBasisFixture();
  let touched = 0;
  const accessor = { get value() {
    touched += 1;
    return "not data";
  } };
  const malformed = [accessor, { value: undefined }, { value: Number.NaN }, { value: -0 }, { value: new Date() }, { value: [1, , 3] }, { value: 1, [Symbol("hidden")]: true }];
  for (const values of malformed) expect(await held.owner.observe(held.scope, values as JsonObject)).toEqual({ status: "unknown", code: "unsupported_input" });
  expect(touched).toBe(0);
  expect(held.writeSnapshot).not.toHaveBeenCalled();
});

it("validates paths, scope and exact reference shape before reading storage", async () => {
  const held = inputBasisFixture();
  expect(await held.owner.observe({ ...held.scope, projectId: "../escape" }, {})).toEqual({ status: "unknown", code: "invalid_scope" });
  expect(await held.owner.observe({ ...held.scope, principalId: "someone.else" }, {})).toEqual({ status: "unknown", code: "scope_unverified" });
  const reference = { ownerId: "owner", bindingId: "binding", revision: 1, extra: true };
  expect(await held.owner.reopen(held.scope, reference)).toEqual({ status: "unknown", code: "invalid_reference" });
  expect(held.read).not.toHaveBeenCalled();
});

it("preserves original write failure and the previous committed head", async () => {
  const held = inputBasisFixture();
  const first = await held.owner.observe(held.scope, { value: "first" });
  if (first.status !== "bound") throw new Error("Missing first receipt");
  const refused = new Error("write failed");
  held.compareAndSwap.mockRejectedValueOnce(refused);
  await expect(held.owner.observe(held.scope, { value: "second" })).rejects.toBe(refused);
  expect(await first.value.verifyCurrent()).toEqual({ status: "bound", value: true });
  const reopened = await held.owner.reopen(held.scope, first.value.reference);
  expect(reopened.status === "bound" && reopened.value.executionCopy()).toEqual({ value: "first" });
});

it("does not return an unpublished candidate when CAS loses", async () => {
  const held = inputBasisFixture();
  held.compareAndSwap.mockResolvedValueOnce(false);
  const bound = await held.owner.observe(held.scope, { value: "current" });
  expect(bound.status).toBe("bound");
  expect(held.compareAndSwap).toHaveBeenCalledTimes(2);
  if (bound.status === "bound") expect(await bound.value.verifyCurrent()).toEqual({ status: "bound", value: true });
});

it("does not publish a new snapshot whose stored bytes differ from the observed inputs", async () => {
  const held = inputBasisFixture();
  const write = held.writeSnapshot.getMockImplementation()!;
  held.writeSnapshot.mockImplementation(async scope => await write(scope, { value: "different stored bytes" }));
  expect(await held.owner.observe(held.scope, { value: "requested bytes" })).toEqual({ status: "unknown", code: "snapshot_unavailable" });
  expect(held.compareAndSwap).not.toHaveBeenCalled();
});

it("does not publish when a producer changes during the snapshot write", async () => {
  const held = inputBasisFixture();
  const write = held.writeSnapshot.getMockImplementation()!;
  held.writeSnapshot.mockImplementation(async (...args) => {
    const reference = await write(...args);
    held.producerState.revision = 2;
    return reference;
  });
  expect(await held.owner.observe(held.scope, { value: "normal" }, [held.producer])).toEqual({ status: "unknown", code: "producer_unverified" });
  expect(held.compareAndSwap).not.toHaveBeenCalled();
});

it("does not publish when secrecy inspection becomes unverified during the snapshot write", async () => {
  const held = inputBasisFixture();
  const write = held.writeSnapshot.getMockImplementation()!;
  held.writeSnapshot.mockImplementation(async (...args) => {
    const reference = await write(...args);
    held.inspect.mockResolvedValue("unverified");
    return reference;
  });
  expect(await held.owner.observe(held.scope, { value: "normal" })).toEqual({ status: "unknown", code: "secrecy_unverified" });
  expect(held.compareAndSwap).not.toHaveBeenCalled();
});

describe("input owner cancellation", () => {
  it.each(["scope", "secrecy", "producer"] as const)("propagates the original AbortError from %s authority", async port => {
    const held = inputBasisFixture(), cancelled = new DOMException("Authority operation cancelled", "AbortError");
    const ports = { ...held.ports };
    if (port === "scope") ports.scopeAuthority = { authorize: async () => { throw cancelled; } };
    if (port === "secrecy") held.inspect.mockRejectedValueOnce(cancelled);
    if (port === "producer") held.verifyProducer.mockRejectedValueOnce(cancelled);
    const owner = new AutomationStudioInputBasisOwner(ports);
    await expect(owner.observe(held.scope, {}, port === "producer" ? [held.producer] : [])).rejects.toBe(cancelled);
    expect(held.writeSnapshot).not.toHaveBeenCalled();
    expect(held.compareAndSwap).not.toHaveBeenCalled();
  });

  it("preserves an operation signal's exact reason during a gated authority check", async () => {
    const held = inputBasisFixture(), controller = new AbortController(), reason = { kind: "caller_cancelled" };
    let entered!: () => void;
    let release!: () => void;
    const checking = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const owner = new AutomationStudioInputBasisOwner({ ...held.ports, scopeAuthority: { authorize: async () => {
      entered();
      await gate;
      return true;
    } } });
    const pending = owner.observe(held.scope, { value: "normal" }, [], controller.signal);
    await checking;
    controller.abort(reason);
    release();
    await expect(pending).rejects.toBe(reason);
    expect(held.writeSnapshot).not.toHaveBeenCalled();
    expect(held.compareAndSwap).not.toHaveBeenCalled();
  });

  it("returns no receipt when cancelled before head publication", async () => {
    const held = inputBasisFixture(), controller = new AbortController(), reason = new Error("caller stopped before commit");
    let entered!: () => void;
    let release!: () => void;
    const checking = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const read = held.readSnapshot.getMockImplementation()!;
    held.readSnapshot.mockImplementation(async (...args) => {
      entered();
      await gate;
      return await read(...args);
    });
    const pending = held.owner.observe(held.scope, { value: "normal" }, [], controller.signal);
    await checking;
    controller.abort(reason);
    release();
    await expect(pending).rejects.toBe(reason);
    expect(held.compareAndSwap).not.toHaveBeenCalled();
  });

  it("does not claim rollback when cancellation follows a committed head write", async () => {
    const held = inputBasisFixture(), controller = new AbortController(), reason = "cancelled after commit";
    let entered!: () => void;
    let release!: () => void;
    const committed = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const swap = held.compareAndSwap.getMockImplementation()!;
    held.compareAndSwap.mockImplementation(async (...args) => {
      const written = await swap(...args);
      entered();
      await gate;
      return written;
    });
    const pending = held.owner.observe(held.scope, { value: "normal" }, [], controller.signal);
    await committed;
    controller.abort(reason);
    release();
    await expect(pending).rejects.toBe(reason);
    expect((await held.read())?.head?.reference.revision).toBe(1);
  });

  it("checks supplied signals on reopen/current verification without reading storage", async () => {
    const held = inputBasisFixture(), controller = new AbortController(), reason = { code: "operation_cancelled" };
    controller.abort(reason);
    const reference = { ownerId: "owner", bindingId: "binding", revision: 1 };
    await expect(held.owner.reopen(held.scope, reference, controller.signal)).rejects.toBe(reason);
    await expect(held.owner.verifyCurrent(held.scope, reference, controller.signal)).rejects.toBe(reason);
    expect(held.read).not.toHaveBeenCalled();
  });

  it("propagates producer cancellation from a published lease's current check", async () => {
    const held = inputBasisFixture(), cancelled = new DOMException("Producer lookup cancelled", "AbortError");
    const bound = await held.owner.observe(held.scope, {}, [held.producer]);
    if (bound.status !== "bound") throw new Error("Missing published lease");
    held.verifyProducer.mockRejectedValueOnce(cancelled);
    await expect(bound.value.verifyCurrent()).rejects.toBe(cancelled);
  });

  it.each(["scope", "secrecy", "producer"] as const)("keeps ordinary %s authority errors closed unknown", async port => {
    const held = inputBasisFixture(), failure = new Error("private authority text");
    const ports = { ...held.ports };
    if (port === "scope") ports.scopeAuthority = { authorize: async () => { throw failure; } };
    if (port === "secrecy") held.inspect.mockRejectedValueOnce(failure);
    if (port === "producer") held.verifyProducer.mockRejectedValueOnce(failure);
    const result = await new AutomationStudioInputBasisOwner(ports).observe(held.scope, {}, port === "producer" ? [held.producer] : []);
    expect(result).toEqual({ status: "unknown", code: port === "scope" ? "scope_unverified" : port === "secrecy" ? "secrecy_unverified" : "producer_unverified" });
    expect(JSON.stringify(result)).not.toContain("private authority text");
    expect(held.compareAndSwap).not.toHaveBeenCalled();
  });
});
