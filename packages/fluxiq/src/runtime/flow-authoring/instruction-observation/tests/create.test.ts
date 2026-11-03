import { expect, it } from "vitest";
import type { AutomationStudioInstructionReading } from "../../../../flows/executable/permissions/index.ts";
import { createExecutionAdmissionAuthority } from "../../../execution-admission/index.ts";
import { AdmissionTestScopeOwner } from "../../../execution-admission/tests/scope-owner.ts";
import { AdmissionTestSource } from "../../../execution-admission/tests/source.ts";
import { OriginalExecutionPromiseReceipts } from "../../../execution-observation/queue-completion/index.ts";
import { observationFixture } from "../../../execution-observation/tests/fixture.ts";
import { AuthoringExecutionScope, invokeAuthoringExecutionCallback } from "../../execution/observation/index.ts";
import { createObservedActionInstructionAuthority } from "../index.ts";

const answer: AutomationStudioInstructionReading = { instructed: [], route: { state: "open", instructionSetDigest: "actual.digest" } };

it("shares its actual acknowledged read across concurrent accessors and a later admitted cached read", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  let original: Promise<AutomationStudioInstructionReading> | undefined;
  class Reader {
    #calls = 0;
    get calls() { return this.#calls; }
    read(): Promise<AutomationStudioInstructionReading> {
      const current = AuthoringExecutionScope.of(this);
      if (!current) throw new Error("The original private reader needs its actual entered child.");
      this.#calls++;
      started();
      const returned: Promise<AutomationStudioInstructionReading> = held.then(() => {
        receipts.issue(returned, f.source, current.context.parent, { disposition: "settled", completionDigest: "controlled.read.acknowledged", assessmentDigest: "controlled.read.no_queued_work" });
        return answer;
      });
      original = returned;
      return returned;
    }
  }
  const reader = new Reader();
  f.source.manage({ receiver: reader, callback: reader.read, contract: "managed_direct_effects", consumeCompletion(input) {
    expect(input.returned).toBe(original);
    return receipts.consume(input);
  } });
  const authority = createObservedActionInstructionAuthority(reader, f.source);
  const invocation = Object.freeze({});
  const scoped = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  let settled = false;
  const derived = invokeAuthoringExecutionCallback(invocation, { receiver: {}, callback: authority.derive, args: [] }).then(value => {
    settled = true;
    return value;
  });
  const routed = invokeAuthoringExecutionCallback(invocation, { receiver: {}, callback: authority.route.read, args: [] });
  try {
    await entered;
    expect(reader.calls).toBe(1);
    expect(settled).toBe(false);
    expect(authority.route.peek()).toEqual({ state: "unread" });
    release();
    expect(await derived).toBe(answer.instructed);
    expect(await routed).toBe(answer.route);
    expect(AuthoringExecutionScope.of(reader)).toBeUndefined();
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
  } finally {
    release();
    await Promise.allSettled([derived, routed]);
    scoped.close();
  }
  const origin = f.root.origin("a later genuinely admitted cached read");
  const reserved = await f.authority.consumer.reserve(f.scope, f.rootPorts.issuer.fromOrdinaryAdmission(f.root.admit(origin)));
  const next = Object.freeze({});
  const current = new AuthoringExecutionScope(next, { parent: { reservation: reserved.reservation, parent: reserved.root }, callbacks: f.source, automation: undefined, originalRoot: reserved.root });
  try {
    expect(await invokeAuthoringExecutionCallback(next, { receiver: {}, callback: authority.derive, args: [] })).toBe(answer.instructed);
    expect(reader.calls).toBe(1);
    expect(authority.route.peek()).toBe(answer.route);
    await f.rootPorts.producer.finish(reserved.root, f.root.complete(origin));
    await f.authority.consumer.release(reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  } finally { current.close(); }
});

it("keeps a fulfilled unsupported reader unknown across a reopened authority without a second read", async () => {
  const f = await observationFixture();
  let calls = 0;
  const reader = { read() {
    expect(this).toBe(reader);
    calls++;
    return Promise.resolve(answer);
  } };
  const authority = createObservedActionInstructionAuthority(reader, f.source);
  const invocation = Object.freeze({});
  const scoped = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  try {
    expect(await invokeAuthoringExecutionCallback(invocation, { receiver: {}, callback: authority.derive, args: [] })).toBe(answer.instructed);
    expect(calls).toBe(1);
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
    const scopes = new AdmissionTestScopeOwner();
    const reopened = createExecutionAdmissionAuthority({ persistence: f.store, scopes });
    const scope = await reopened.openScope(scopes.issue());
    const source = new AdmissionTestSource(scope, "test.reopened-reader");
    const ports = reopened.registerSource(source);
    const origin = source.origin();
    await expect(reopened.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(source.admit(origin)))).rejects.toThrow("store.blocked");
    expect(calls).toBe(1);
  } finally { scoped.close(); }
});

it.each(["throw", "reject"] as const)("retains the original %s in its once cache without another reader invocation", async kind => {
  const f = await observationFixture();
  let calls = 0;
  const failure = new Error("controlled original instruction read failed");
  const reader = { read(): Promise<AutomationStudioInstructionReading> {
    calls++;
    if (kind === "throw") throw failure;
    return Promise.reject(failure);
  } };
  const receipts = new OriginalExecutionPromiseReceipts();
  f.source.manage({ receiver: reader, callback: reader.read, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const authority = createObservedActionInstructionAuthority(reader, f.source);
  const invocation = Object.freeze({});
  const scoped = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  try {
    await expect(invokeAuthoringExecutionCallback(invocation, { receiver: {}, callback: authority.derive, args: [] })).rejects.toBe(failure);
    const before = f.store.events.length;
    // This cache is private and never evicts or falls back to a live reader.
    // Passive access under the ongoing original context creates no admission.
    await expect(authority.derive.call(invocation)).rejects.toBe(failure);
    expect(await authority.route.read.call(invocation)).toEqual({ state: "unavailable", reason: "transport" });
    expect(f.store.events).toHaveLength(before);
    await expect(invokeAuthoringExecutionCallback(invocation, { receiver: {}, callback: authority.derive, args: [] })).rejects.toThrow("execution_admission.pending_interruption");
    expect(calls).toBe(1);
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  } finally { scoped.close(); }
});

it("refuses an absent or foreign current source before invoking the original reader", async () => {
  const f = await observationFixture();
  const foreign = await observationFixture();
  let calls = 0;
  const authority = createObservedActionInstructionAuthority({ read() {
    calls++;
    return Promise.resolve(answer);
  } }, f.source);
  expect(() => authority.derive()).toThrow("instruction_observation.current_scope_required");
  expect(authority.route.peek()).toEqual({ state: "unread" });
  const invocation = Object.freeze({});
  const scoped = new AuthoringExecutionScope(invocation, { parent: foreign.parent, callbacks: foreign.source, automation: undefined, originalRoot: foreign.reserved.root });
  try {
    await expect(invokeAuthoringExecutionCallback(invocation, { receiver: {}, callback: authority.derive, args: [] })).rejects.toThrow("instruction_observation.foreign_source");
    expect(calls).toBe(0);
  } finally {
    scoped.close();
    await foreign.authority.consumer.release(foreign.reserved.reservation);
    await f.authority.consumer.release(f.reserved.reservation);
  }
});
