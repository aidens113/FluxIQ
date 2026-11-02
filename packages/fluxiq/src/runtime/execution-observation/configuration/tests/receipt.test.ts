import { expect, it } from "vitest";
import type { ExecutionCallbackCompletion, ExecutionCallbackOutcome } from "../../contracts/index.ts";
import { captureExecutionCallbackCompletions } from "../index.ts";
import { observationFixture } from "../../tests/fixture.ts";

class OriginalWriter {
  readonly failure = new Error("actual writer lost completion");
  readonly #receipts = new WeakMap<Promise<void>, ExecutionCallbackCompletion>();
  #writes = 0;
  originalPromise: Promise<void> | undefined;

  write(delta: number, argument: object): Promise<void> { return this.perform(delta, argument, "committed"); }
  unknown(delta: number, argument: object): Promise<void> { return this.perform(delta, argument, "unknown"); }
  rejected(delta: number, argument: object): Promise<void> { return this.perform(delta, argument, "rejected"); }
  copied(delta: number, argument: object): Promise<void> { return this.write(delta, argument).then(() => undefined); }
  writes(): number { return this.#writes; }

  consume(original: Promise<void> | undefined): ExecutionCallbackCompletion | null {
    if (!original) return null;
    const receipt = this.#receipts.get(original);
    this.#receipts.delete(original);
    return receipt ?? null;
  }

  private perform(delta: number, argument: object, completion: "committed" | "unknown" | "rejected"): Promise<void> {
    expect(Object.keys(argument)).toEqual(["original"]);
    const returned = Promise.resolve().then(() => {
      this.#writes += delta;
      if (completion === "rejected") throw this.failure;
      if (completion === "committed") this.#receipts.set(returned, Object.freeze({ disposition: "settled", completionDigest: "original.writer.committed", assessmentDigest: "original.private.receipt" }));
    });
    this.originalPromise = returned;
    return returned;
  }
}

it("pins a private completion reader and authenticates only the original async-void producer promise", async () => {
  const f = await observationFixture();
  const writer = new OriginalWriter();
  const callback = writer.write;
  const binding = Object.freeze({});
  const argument = Object.freeze({ original: true });
  class Declaration {
    readonly receiver = writer;
    readonly callback = callback;
    readonly binding = binding;
    readonly contract = "managed_direct_effects" as const;
    #reads = 0;
    consumeCompletion(input: { invocation: object; outcome: ExecutionCallbackOutcome<void>; returned?: Promise<void> | undefined }) {
      this.#reads += 1;
      expect(input.returned).toBe(writer.originalPromise);
      expect(input.outcome).toEqual({ kind: "fulfilled", value: undefined });
      return writer.consume(input.returned);
    }
    reads() { return this.#reads; }
  }
  const declaration = new Declaration();
  const declarations = [declaration];
  const policy = captureExecutionCallbackCompletions({ configure(registrar) {
    for (const original of declarations) registrar.manage(original);
  } });
  declaration.consumeCompletion = () => { throw new Error("replacement completion reader invoked"); };
  Reflect.set(declaration, "receiver", new OriginalWriter());
  Reflect.set(declaration, "callback", writer.unknown);
  Reflect.set(declaration, "binding", Object.freeze({}));
  Reflect.set(declaration, "contract", "no_direct_effects");
  declarations.splice(0);
  policy.apply(f.source);
  const invocation = await f.source.prepare(f.observation, { receiver: writer, callback, binding });
  expect(await f.source.invoke(invocation, { receiver: writer, callback, binding, args: [2, argument] })).toBeUndefined();
  expect(writer.writes()).toBe(2);
  expect(declaration.reads()).toBe(1);
  expect(f.source.completion(invocation)).toBe("settled");
  expect(writer.consume(writer.originalPromise)).toBeNull();
});

it.each(["copied", "unknown", "rejected"] as const)("does not certify an actual writer from its %s return", async kind => {
  const f = await observationFixture();
  const writer = new OriginalWriter();
  const callback = writer[kind];
  captureExecutionCallbackCompletions({ configure(registrar) {
    registrar.manage({ receiver: writer, callback, contract: "managed_direct_effects", consumeCompletion({ returned }) {
      if (kind === "copied") expect(returned).not.toBe(writer.originalPromise);
      else expect(returned).toBe(writer.originalPromise);
      return writer.consume(returned);
    } });
  } }).apply(f.source);
  const invocation = await f.source.prepare(f.observation, { receiver: writer, callback });
  const running = f.source.invoke(invocation, { receiver: writer, callback, args: [1, Object.freeze({ original: true })] });
  if (kind === "rejected") await expect(running).rejects.toBe(writer.failure);
  else await expect(running).resolves.toBeUndefined();
  expect(writer.writes()).toBe(1);
  expect(f.source.completion(invocation)).toBe(kind === "rejected" ? "pending" : "unverified");
});
