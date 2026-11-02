import { expect, it } from "vitest";
import type { ExecutionCallbackCompletion, ExecutionCallbackOutcome } from "../index.ts";
import { observationFixture } from "./fixture.ts";

it("retains the original producer promise for a private receipt when its public value is void", async () => {
  const f = await observationFixture();
  const receipts = new WeakMap<object, ExecutionCallbackCompletion>();
  let writes = 0, originalPromise: Promise<void> | undefined;
  const backend = { run() {
    const result = Promise.resolve().then(() => {
      writes++;
      receipts.set(result, { disposition: "settled", completionDigest: `actual.write.${writes}`, assessmentDigest: "actual.writer.committed" });
    });
    originalPromise = result;
    return result;
  } };
  f.source.manage({ receiver: backend, callback: backend.run, contract: "managed_direct_effects", consumeCompletion({ returned, outcome }) {
    expect(returned).toBe(originalPromise);
    expect(outcome).toEqual({ kind: "fulfilled", value: undefined });
    if (!returned) return null;
    const receipt = receipts.get(returned);
    receipts.delete(returned);
    return receipt ?? null;
  } });
  const entered = await f.source.prepare(f.observation, { receiver: backend, callback: backend.run });
  await expect(f.source.invoke(entered, { receiver: backend, callback: backend.run, args: [] })).resolves.toBeUndefined();
  expect(writes).toBe(1);
  expect(f.source.completion(entered)).toBe("settled");
  expect(receipts.has(originalPromise!)).toBe(false);
});

it("does not treat fulfillment or a substituted promise as an authenticated completion", async () => {
  const f = await observationFixture(), expected = Promise.resolve();
  const registered = { receiver: undefined, callback: () => Promise.resolve(), contract: "managed_direct_effects" as const,
    consumeCompletion(input: { returned?: Promise<void> | undefined; outcome: ExecutionCallbackOutcome<void> }) {
      expect(input.returned).not.toBe(expected);
      return null;
    }
  };
  f.source.manage(registered);
  const entered = await f.source.prepare(f.observation, registered);
  await f.source.invoke(entered, { ...registered, args: [] });
  expect(f.source.completion(entered)).toBe("unverified");
});
