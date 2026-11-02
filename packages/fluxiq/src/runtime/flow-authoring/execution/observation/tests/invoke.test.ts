import { expect, it } from "vitest";
import { observationFixture } from "../../../../execution-observation/tests/fixture.ts";
import { AuthoringExecutionScope, invokeAuthoringExecutionCallback, invokeAuthoringExecutionSync } from "../index.ts";

it("enters before the original private receiver runs and restores its scoped binding after an original error", async () => {
  const f = await observationFixture();
  const argument = Object.freeze({ value: "retained" });
  class Reader {
    #reads = 0;
    read(given: object): number {
      expect(given).toBe(argument);
      expect(f.store.events.at(-1)).toBe("enter");
      const current = AuthoringExecutionScope.of(this);
      if (!current) throw new Error("the actual original receiver did not receive its entered child");
      expect(current.context.originalRoot).toBe(f.reserved.root);
      this.#reads++;
      return this.#reads;
    }
    fail(): never { throw new Error("synthetic original reader failure"); }
  }
  const receiver = new Reader();
  f.source.manage({ receiver, callback: receiver.read, contract: "no_direct_effects" });
  f.source.manage({ receiver, callback: receiver.fail, contract: "no_direct_effects" });
  const invocation = Object.freeze({});
  const scope = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  try {
    expect(await invokeAuthoringExecutionCallback(invocation, { receiver, callback: receiver.read, args: [argument] })).toBe(1);
    expect(AuthoringExecutionScope.of(receiver)).toBeUndefined();
    await expect(invokeAuthoringExecutionCallback(invocation, { receiver, callback: receiver.fail, args: [] })).rejects.toThrow("synthetic original reader failure");
    expect(AuthoringExecutionScope.of(receiver)).toBeUndefined();
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  } finally { scope.close(); }
});

it("preserves an unsupported synchronous callback's first result and durable unknown without a second invocation", async () => {
  const f = await observationFixture();
  let writes = 0;
  const supplied = { write() {
    writes++;
    return "the original result";
  } };
  const frame = { run() { return invokeAuthoringExecutionSync(this, { receiver: supplied, callback: supplied.write, args: [] }); } };
  f.source.manage({ receiver: frame, callback: frame.run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.source.frameCompletion(invocation) });
  const invocation = Object.freeze({});
  const scope = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  try {
    expect(await invokeAuthoringExecutionCallback(invocation, { receiver: frame, callback: frame.run, args: [] })).toBe("the original result");
    expect(writes).toBe(1);
    expect(AuthoringExecutionScope.of(frame)).toBeUndefined();
    await f.authority.consumer.release(f.reserved.reservation);
    const later = f.root.origin("a genuine later invocation");
    await expect(f.authority.consumer.reserve(f.scope, f.rootPorts.issuer.fromOrdinaryAdmission(f.root.admit(later)))).rejects.toThrow();
    expect(writes).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  } finally { scope.close(); }
});
