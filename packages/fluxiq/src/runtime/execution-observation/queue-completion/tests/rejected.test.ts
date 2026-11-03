import { expect, it } from "vitest";
import { prepareObservedExecutionCallback } from "../../owned/index.ts";
import { observationFixture } from "../../tests/fixture.ts";
import { OriginalExecutionPromiseReceipts } from "../index.ts";

it.each(["genuine", "copied_error", "swapped_promise", "foreign_child", "ordinary_issue"] as const)("authenticates a %s rejected completion against the actual error, Promise and child", async kind => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const actualError = Object.freeze({ status: 429, code: "completed.refusal" });
  const execution: { observation?: typeof f.observation | undefined } = {};
  const completion = { disposition: "unacted" as const, completionDigest: "owner.actual.drained_refusal", assessmentDigest: "owner.actual.original_error" };
  let original!: Promise<never>;
  let completed = 0;
  const owner = { run() {
    original = Promise.resolve().then(() => {
      completed++;
      const child = kind === "foreign_child" ? f.observation : execution.observation!;
      if (kind === "ordinary_issue") receipts.issueObserved(original, child, completion);
      else if (kind === "swapped_promise") receipts.issueRejectedObserved(Promise.resolve(), actualError, child, completion);
      else receipts.issueRejectedObserved(original, kind === "copied_error" ? { ...actualError } : actualError, child, completion);
      throw actualError;
    });
    return original;
  } };
  f.source.manage({ receiver: owner, callback: owner.run, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const owned = await prepareObservedExecutionCallback(f.observation, { receiver: owner, callback: owner.run, args: [] });
  execution.observation = owned.observation;
  await expect(owned.invoke()).rejects.toBe(actualError);
  expect(completed).toBe(1);
  expect(owned.completion()).toBe(kind === "genuine" ? "settled" : kind === "foreign_child" ? "unknown" : "pending");
  if (kind !== "swapped_promise") expect(() => receipts.issueRejectedObserved(original, actualError, execution.observation!, completion)).toThrow("reissued");
});

it("refuses copied observation membership before issuing any rejected receipt", async () => {
  const f = await observationFixture();
  const receipts = new OriginalExecutionPromiseReceipts();
  const copied = { ...f.observation } as typeof f.observation;
  expect(() => receipts.issueRejectedObserved(Promise.resolve(), new Error("original"), copied, { disposition: "unacted", completionDigest: "claimed", assessmentDigest: "claimed" })).toThrow("foreign_binding");
});
