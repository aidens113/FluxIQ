import { describe, expect, it } from "vitest";
import { runAgentIterations } from "../index.ts";

describe("the policy-driven agent iteration runner", () => {
  it("continues in order and returns the first terminal policy result", async () => {
    const seen: number[] = [];
    const result = await runAgentIterations({
      maxIterations: 5,
      iterate: async (iteration) => {
        seen.push(iteration);
        return iteration === 3 ? { kind: "complete", result: "answered" } : { kind: "continue" };
      },
      exhausted: () => "exhausted"
    });
    expect(result).toBe("answered");
    expect(seen).toEqual([1, 2, 3]);
  });

  it("exhausts once at the original bound and leaves cancellation interpretation to the policy", async () => {
    const seen: number[] = [];
    let exhausted = 0;
    expect(await runAgentIterations({ maxIterations: 2, iterate: async (iteration) => {
      seen.push(iteration);
      return { kind: "continue" };
    }, exhausted: () => { exhausted += 1;
      return "done"; } })).toBe("done");
    expect(seen).toEqual([1, 2]);
    expect(exhausted).toBe(1);
    const controller = new AbortController();
    expect(await runAgentIterations({ maxIterations: 5, iterate: async (iteration) => {
      if (controller.signal.aborted) return { kind: "complete", result: "cancelled" };
      controller.abort();
      seen.push(iteration);
      return { kind: "continue" };
    }, exhausted: () => "exhausted" })).toBe("cancelled");
  });

  it("propagates policy failures immediately without advancing or exhausting", async () => {
    const failure = new Error("policy failed");
    let seen = 0;
    await expect(runAgentIterations({ maxIterations: 5, iterate: async () => {
      seen += 1;
      throw failure;
    }, exhausted: () => { throw new Error("must not exhaust"); } })).rejects.toBe(failure);
    expect(seen).toBe(1);
  });
});
