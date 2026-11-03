// A brief that waits on a predecessor is sized as it starts (t627): a
// predecessor topped up from the build's purse cannot leave it unable to start
// while the purse still has a share for it, and every return says what its
// allowance was given and drew, in figures.
import { describe, expect, it } from "vitest";
import { doneOutcome, gardenBrief, gardenBuild, type BuilderScript } from "./dispatch-fixture.ts";

const read = () => gardenBrief("b-read", "list_seeds", [], (brief) => Object.assign(brief, { allowanceUsd: 0.03 }));
const plant = () => gardenBrief("b-plant", "plant_packet", ["list_seeds"], (brief) => Object.assign(brief, { allowanceUsd: 0.03 }));

/** A builder that spends $0.01 a call until its allowance, top-ups and all, refuses, then returns done. */
const spendsAll: BuilderScript = async (input) => {
  for (;;) {
    const held = input.loop.purse?.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 10, maxOutputTokens: 10 });
    if (!held?.ok) break;
    held.hold.settle({ estimatedCostUsd: 0.01 });
  }
  return await doneOutcome(input);
};

describe("a brief that waits on a predecessor", () => {
  it("starts with a share of what the purse can give once its predecessor was topped up, where the dispatch-time figure no longer fits", async () => {
    // Both sized at $0.03 of $0.08; the first is topped up to twice its share and spends $0.06.
    const build = await gardenBuild({ capacity: 1, ceilingUsd: 0.08, briefs: [read(), plant()], scripts: { "b-read": spendsAll } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "done" });
    expect(returns[0]!.spentUsd).toBeCloseTo(0.06, 9);
    expect(returns[0]!.reason).toMatch(/ Its allowance was topped up from the build's purse 2 times, \$0\.0300 in all \(llm_budget\.allowance_topped_up\): \$0\.0200 when a call held at \$0\.0100 was \$0\.0100 short; \$0\.0100 when a call held at \$0\.0100 was \$0\.0100 short\.$/);
    // $0.02 is left: the $0.03 it was sized at no longer fits, so it is split with the build's finishing.
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read", "b-plant"]);
    const started = build.seen[1]!.purse!;
    expect(started.carvedUsd).toBeCloseTo(0.01, 9);
    expect(returns[1]).toMatchObject({ briefId: "b-plant", outcome: "done", calls: 1 });
    expect(returns[1]!.reason).toContain("It started after its predecessor with an allowance of $0.0100 of the $0.0300 it was sized at: its share of what the build's purse could then give.");
    // The record holds the allowance it was carved at, and both returns with their figures.
    const view = await build.store.read(build.dispatcherInput.record.ref);
    expect(view!.record.allowances.map(({ briefId, usd }) => [briefId, Number(usd.toFixed(6))])).toEqual([["b-read", 0.03], ["b-plant", 0.01]]);
    expect(view!.returns.find((entry) => entry.briefId === "b-read")!.builderReturn.reason).toContain("llm_budget.allowance_topped_up");
  });

  it("keeps what the dispatch sized it at when the purse can still give that as its share", async () => {
    const build = await gardenBuild({ capacity: 1, ceilingUsd: 1, briefs: [read(), plant()] });
    const { returns } = await build.run();
    expect(build.seen[1]!.purse!.carvedUsd).toBe(0.03);
    expect(returns[1]!.reason).not.toContain("started after its predecessor");
    expect(returns[0]!.reason).not.toContain("topped up");
  });

  it("does not start, with the carve's figures, when the purse has nothing it can give", async () => {
    // $0.06 in all: the first, topped up to twice its share, leaves nothing.
    const build = await gardenBuild({ capacity: 1, ceilingUsd: 0.06, briefs: [read(), plant()], scripts: { "b-read": spendsAll } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "done" });
    expect(returns[1]).toEqual({ briefId: "b-plant", outcome: "blocked", reason: "The build's purse could not carve this brief's allowance of $0.0300; $0.0000 could still be allotted.", trials: [], spentUsd: 0, calls: 0 });
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
  });
});
