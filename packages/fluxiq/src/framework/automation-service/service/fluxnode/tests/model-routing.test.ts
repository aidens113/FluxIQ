// @fluxiq-test-group real-sql
// A FluxNode keeps its starting model for decisions and judging. Distinct obsolete role models make accidental
// routing visible; real served calls, reservations and charges all belong to the starting model.
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "../../answer-first/tests/fake-library.ts";
import { findLoans, findLoansSpec, fluxNodeLane } from "./library-lane.ts";
import { LANE_DEFAULT_MODEL } from "./priced-models.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** Prices per token far enough apart that a call charged at the wrong model cannot pass for the right one. */
const PRICES = { [LANE_DEFAULT_MODEL]: 0.000_002, explorer: 0.000_01, judge: 0.000_4, "explorer-b": 0.000_003, "judge-b": 0.000_2 };
/** A FluxNode the judge confirms: no check of its own and no declared outputs, judged on every run. */
const judged = () => findLoansSpec({ hasCheck: false, outputs: undefined, options: { judge: "always" } });
const script = { taskProcessing: { process: { where: [{ field: "title", contains: { $input: "title", test: "Birds" } }], columns: ["title", "due"] } }, script: [findLoans("Birds"), complete("Found the loans.")] };
/** The judge and decision calls, by model; the instruction reading is the explore model's too. */
const byModel = (served: readonly { model: string; taskKind: string }[]) => served.map(({ model, taskKind }) => `${model}:${taskKind}`);

describe("a FluxNode run's fixed starting model", () => {
  it("serves decisions and judging on the starting model and charges every actual call at that price", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const run = await lane.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { explore: "explorer", judge: "judge" } } }, script);

    expect(run.result).toMatchObject({ status: "achieved", verdict: { by: "judge" } });
    expect(run.judgeCalls.length).toBeGreaterThan(0);
    const served = byModel(lane.served);
    expect(new Set(served.filter((call) => call.endsWith(":loop_verification")))).toEqual(new Set(["explorer:loop_verification"]));
    expect(new Set(served.filter((call) => !call.endsWith(":loop_verification")))).toEqual(new Set(["explorer:evidence_tool_decision"]));
    expect(lane.served).toHaveLength(run.asked.length);
    // The run's one purse is charged what each call cost at the model that served it, and nothing else.
    const charged = lane.served.reduce((sum, call) => sum + call.costUsd, 0);
    expect(run.result.cost.calls).toBe(lane.served.length);
    expect(run.result.cost.usd).toBeCloseTo(charged, 9);
    expect(run.result.cost.usd).toBeCloseTo(lane.served.length * 15 * PRICES.explorer, 9);
    expect(new Set(lane.priced)).toEqual(new Set(["explorer"]));
  });

  it("rejects an unknown starting model before any call and never resolves an unused judge selector", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const unknownModel = await lane.run({ spec: judged(), inputs: { title: "Birds" }, options: { model: "no-such-model" } }, script);
    const unknownJudge = await lane.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { judge: "no-such-model" } } }, script);

    expect(unknownModel.asked).toHaveLength(0);
    expect(unknownModel.result.cost).toEqual({ calls: 0, tokens: 0, usd: 0 });
    expect(unknownModel.result.status).toBe("stopped");
    expect(unknownJudge.result.status).toBe("achieved");
    expect(unknownJudge.judgeCalls.length).toBeGreaterThan(0);
    expect(new Set(lane.served.map((call) => call.model))).toEqual(new Set([LANE_DEFAULT_MODEL]));
  });

  it("is one model, as before, for a run with no models", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const run = await lane.run({ spec: judged(), inputs: { title: "Birds" } }, script);
    expect(run.result.status).toBe("achieved");
    expect(new Set(lane.served.map((call) => call.model))).toEqual(new Set([LANE_DEFAULT_MODEL]));
    expect(new Set(lane.served.map((call) => call.taskKind))).toEqual(new Set(["evidence_tool_decision", "loop_verification"]));
  });

  it("keeps two concurrent runs on their own starting model", async () => {
    const [one, two] = await Promise.all([fluxNodeLane(cleanups, { models: PRICES }), fluxNodeLane(cleanups, { models: PRICES })]);
    const [ranOne, ranTwo] = await Promise.all([
      one.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { explore: "explorer", judge: "judge" } } }, script),
      two.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { explore: "explorer-b", judge: "judge-b" } } }, script)
    ]);
    expect([ranOne.result.status, ranTwo.result.status]).toEqual(["achieved", "achieved"]);
    expect(new Set(byModel(one.served))).toEqual(new Set(["explorer:evidence_tool_decision", "explorer:loop_verification"]));
    expect(new Set(byModel(two.served))).toEqual(new Set(["explorer-b:evidence_tool_decision", "explorer-b:loop_verification"]));
  });
});
