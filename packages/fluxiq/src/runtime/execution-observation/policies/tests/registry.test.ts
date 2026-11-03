import { expect, it } from "vitest";
import type { ExecutionCallbackObservation, ManagedExecutionCallbackRegistration } from "../../contracts/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../queue-completion/index.ts";
import { observationFixture } from "../../tests/fixture.ts";
import { ExecutionCallbackPolicies as Policies } from "../index.ts";

it("pins the original managed reader and private receiver and waits for its actual completion", async () => {
  const f = await observationFixture();
  let commit!: () => void;
  const held = new Promise<void>(resolve => { commit = resolve; });
  const receipts = new WeakSet<object>();
  class Writer {
    #commits = 0;
    write(): Promise<void> {
      const returned = held.then(() => {
        this.#commits++;
        receipts.add(returned);
      });
      return returned;
    }
    commits(): number { return this.#commits; }
  }
  const writer = new Writer();
  let reads = 0;
  const declaration: ManagedExecutionCallbackRegistration<Writer, [], Promise<void>> = {
    receiver: writer, callback: writer.write, contract: "managed_direct_effects",
    consumeCompletion(input) {
      expect(this).toBe(declaration);
      reads++;
      if (!input.returned || !receipts.delete(input.returned)) return { disposition: "unknown", code: "synthetic.missing_receipt" };
      return { disposition: "settled", completionDigest: "synthetic.original_commit", assessmentDigest: "synthetic.original_owner" };
    }
  };
  Policies.remember(writer, writer.write, "frame");
  Policies.rememberManaged(declaration);
  declaration.consumeCompletion = () => { throw new Error("replacement reader must not run"); };
  const call = { receiver: writer, callback: writer.write, args: [] as [] };
  Policies.manage(f.source, call);
  Policies.manage(f.source, call);
  const prepared = await f.source.prepare(f.observation, call);
  const running = f.source.invoke(prepared, call);
  expect(writer.commits()).toBe(0);
  expect(f.source.completion(prepared)).toBe("pending");
  commit();
  expect(await running).toBeUndefined();
  expect(writer.commits()).toBe(1);
  expect(reads).toBe(1);
  expect(f.source.completion(prepared)).toBe("settled");
});

it("refuses changed bindings and replacement managed declarations", async () => {
  const f = await observationFixture();
  const owner = { read: async () => undefined };
  const declaration = { receiver: owner, callback: owner.read, contract: "managed_direct_effects" as const, consumeCompletion: () => null };
  Policies.rememberManaged(declaration);
  expect(() => Policies.rememberManaged(declaration)).toThrow("site_reset.managed_callback_already_bound");
  expect(() => Policies.manage(f.source, { receiver: owner, callback: owner.read, binding: {} })).toThrow("site_reset.managed_binding_mismatch");
  expect(f.source.isManaged({ receiver: owner, callback: owner.read })).toBe(false);
});

it("does not turn a fulfilled promise into the producer's missing receipt", async () => {
  const f = await observationFixture();
  const owner = { write: () => Promise.resolve() };
  Policies.rememberManaged({ receiver: owner, callback: owner.write, contract: "managed_direct_effects", consumeCompletion: () => ({ disposition: "unknown", code: "synthetic.original_receipt_missing" }) });
  const call = { receiver: owner, callback: owner.write, args: [] as [] };
  Policies.manage(f.source, call);
  const prepared = await f.source.prepare(f.observation, call);
  expect(await f.source.invoke(prepared, call)).toBeUndefined();
  expect(f.source.completion(prepared)).toBe("unknown");
});

it("retains an original lexical callback's undefined receiver", async () => {
  const f = await observationFixture();
  const receipts = new WeakSet<object>();
  let commits = 0;
  function persist(this: unknown): Promise<void> {
    expect(this).toBeUndefined();
    const returned = Promise.resolve().then(() => {
      commits++;
      receipts.add(returned);
    });
    return returned;
  }
  Policies.rememberManaged({ receiver: undefined, callback: persist, contract: "managed_direct_effects", consumeCompletion(input) {
    if (!input.returned || !receipts.delete(input.returned)) return { disposition: "unknown", code: "synthetic.lexical_receipt_missing" };
    return { disposition: "settled", completionDigest: "synthetic.lexical_commit", assessmentDigest: "synthetic.lexical_owner" };
  } });
  const changedReceiver = { receiver: {}, callback: persist };
  Policies.manage(f.source, changedReceiver);
  expect(f.source.isManaged(changedReceiver)).toBe(false);
  const call = { receiver: undefined, callback: persist, args: [] as [] };
  Policies.manage(f.source, call);
  const prepared = await f.source.prepare(f.observation, call);
  expect(await f.source.invoke(prepared, call)).toBeUndefined();
  expect(commits).toBe(1);
  expect(f.source.completion(prepared)).toBe("settled");
});

it("specializes only the actual receiver of an original Core lexical producer and pins its private completion reader", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const value = Object.freeze({ retained: "original" });
  let calls = 0;
  const operation = (execution: { observation?: ExecutionCallbackObservation }): Promise<typeof value> => {
    const returned: Promise<typeof value> = Promise.resolve().then(() => {
      calls++;
      if (execution.observation) receipts.issueObserved(returned, execution.observation, { disposition: "settled", completionDigest: "lexical.original_operation", assessmentDigest: "lexical.original_parent" });
      return value;
    });
    return returned;
  };
  class Declaration {
    readonly receiver = undefined;
    readonly callback = operation;
    readonly contract = "managed_direct_effects";
    #reads = 0;
    get reads() { return this.#reads; }
    consumeCompletion(input: Parameters<OriginalExecutionPromiseReceipts["consume"]>[0]) {
      this.#reads++;
      return receipts.consume(input);
    }
  }
  const declaration = new Declaration();
  Policies.rememberManagedLexical(declaration);
  declaration.consumeCompletion = () => { throw new Error("The replacement completion reader must not run."); };
  for (const receiver of [{ owner: "first" }, { owner: "second" }, undefined]) {
    const execution: { observation?: ExecutionCallbackObservation } = {};
    const args: Parameters<typeof operation> = [execution];
    const call = { receiver, callback: operation, args };
    Policies.manage(f.source, call);
    Policies.manage(f.source, call);
    const prepared = await f.source.prepare(f.observation, call);
    execution.observation = f.source.forParent(f.source.context(prepared));
    Object.freeze(execution);
    expect(await f.source.invoke(prepared, call)).toBe(value);
    expect(f.source.completion(prepared)).toBe("settled");
  }
  expect(calls).toBe(3);
  expect(declaration.reads).toBe(3);
  await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
});

it.each(["replacement_promise", "stale_parent", "foreign_source"] as const)("refuses a lexical producer's %s receipt without clearing the actual invocation", async kind => {
  const f = await observationFixture();
  const foreign = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const value = Object.freeze({ retained: "original" });
  let calls = 0;
  const operation = (execution: { observation?: ExecutionCallbackObservation }): Promise<typeof value> => {
    const returned: Promise<typeof value> = Promise.resolve().then(() => {
      calls++;
      const original = kind === "replacement_promise" ? Promise.resolve(value) : returned;
      const observation = kind === "foreign_source" ? foreign.observation : kind === "stale_parent" ? f.observation : execution.observation;
      if (!observation) throw new Error("The actual child observation was not bound.");
      receipts.issueObserved(original, observation, { disposition: "settled", completionDigest: "lexical.wrong_receipt", assessmentDigest: "lexical.wrong_owner_or_parent" });
      return value;
    });
    return returned;
  };
  Policies.rememberManagedLexical({ receiver: undefined, callback: operation, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const execution: { observation?: ExecutionCallbackObservation } = {};
  const args: Parameters<typeof operation> = [execution];
  const call = { receiver: { owner: "actual" }, callback: operation, args };
  Policies.manage(f.source, call);
  const prepared = await f.source.prepare(f.observation, call);
  execution.observation = f.source.forParent(f.source.context(prepared));
  Object.freeze(execution);
  expect(await f.source.invoke(prepared, call)).toBe(value);
  expect(calls).toBe(1);
  expect(f.source.completion(prepared)).toBe("unknown");
  await f.authority.consumer.release(f.reserved.reservation);
  await foreign.authority.consumer.release(foreign.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("keeps lexical binding and duplicate declaration refusals while an unbound return supplies no receipt", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const binding = Object.freeze({});
  const operation = () => Promise.resolve("no original completion");
  const declaration = { receiver: undefined, callback: operation, binding, contract: "managed_direct_effects" as const, consumeCompletion: (input: Parameters<OriginalExecutionPromiseReceipts["consume"]>[0]) => receipts.consume(input) };
  Policies.rememberManagedLexical(declaration);
  expect(() => Policies.rememberManagedLexical(declaration)).toThrow("site_reset.managed_callback_already_bound");
  expect(() => Policies.manage(f.source, { receiver: {}, callback: operation, binding: {} })).toThrow("site_reset.managed_binding_mismatch");
  const call = { receiver: {}, callback: operation, binding, args: [] as [] };
  Policies.manage(f.source, call);
  const prepared = await f.source.prepare(f.observation, call);
  expect(await f.source.invoke(prepared, call)).toBe("no original completion");
  expect(f.source.completion(prepared)).toBe("unknown");
});
