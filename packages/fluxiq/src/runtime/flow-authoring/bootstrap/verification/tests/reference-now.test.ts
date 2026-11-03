import { describe, expect, it } from "vitest";
import { runAutomationStudioDetachedCandidate } from "../index.ts";
import { candidateSubflowFixture } from "./subflow-fixture.ts";

describe("a detached execution's date reference", () => {
  it("captures before awaited routing and preserves the same instant through nested subflows", async () => {
    const { input } = candidateSubflowFixture();
    const startedAt = Date.UTC(2026, 9, 30, 23, 59, 59);
    let live = startedAt;
    const references: Array<number | undefined> = [];
    const native = input.options!.nativeNodeExecutor!;
    input.options = {
      ...input.options, now: () => live,
      nativeNodeExecutor: async (request) => {
        references.push(request.hostContext?.referenceNow);
        return await native(request);
      }
    };
    const identity = input.currentIdentity;
    input.currentIdentity = async () => {
      live += 2_000;
      return await identity();
    };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(result.receipt.startedAt).toBe(startedAt);
    expect(result.trace?.startedAt).toBeGreaterThan(startedAt + 1_000);
    expect(result.trace?.referenceNow).toBe(startedAt);
    expect(references).toEqual([startedAt, startedAt, startedAt]);
  });
});
