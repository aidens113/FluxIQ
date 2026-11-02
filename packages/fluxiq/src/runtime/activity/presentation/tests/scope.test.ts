import { describe, expect, it } from "vitest";
import { emitAutomationStudioActivityThought, runWithRuntimeActivityPresentation } from "../index.ts";

describe("scoped optional runtime presentation", () => {
  it("keeps concurrent runs and an unobserved run independent", async () => {
    const seen: string[][] = [[], []];
    await Promise.all(seen.map((events, index) => runWithRuntimeActivityPresentation({
      invoke: (operation, args) => { events.push(`${operation}:${args[0]}`); }
    }, async () => {
      await Promise.resolve();
      emitAutomationStudioActivityThought(index);
    })));
    emitAutomationStudioActivityThought("outside");
    expect(seen).toEqual([["emitAutomationStudioActivityThought:0"], ["emitAutomationStudioActivityThought:1"]]);
  });

  it("cannot fail execution when an optional presentation adapter throws", () => {
    expect(() => runWithRuntimeActivityPresentation({ invoke: () => { throw new Error("unavailable UI"); } }, () => {
      emitAutomationStudioActivityThought("working");
    })).not.toThrow();
  });
});
