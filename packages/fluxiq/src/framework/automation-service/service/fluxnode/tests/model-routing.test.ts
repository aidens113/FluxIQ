// @fluxiq-test-group real-sql
// A FluxNode run's model per role (W3, t899), on the real service with a scripted model and the lending library
// (`./library-lane.ts`) behind a host resolver of several priced models (`./priced-models.ts`): each call is served by
// its role's model and charged to the run's one purse at that model's price; a role model that cannot be resolved
// ends the run as an unknown `options.model` does; a run with no models is one model, as before; and two runs at once
// each route by their own models.
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
const script = { script: [findLoans("Birds"), complete("Found the loans.")] };
/** The judge and decision calls, by model; the instruction reading is the explore model's too. */
const byModel = (served: readonly { model: string; taskKind: string }[]) => served.map(({ model, taskKind }) => `${model}:${taskKind}`);

describe("a FluxNode run's model per role", () => {
  it("serves each call by its role's model and charges the purse at that model's price", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const run = await lane.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { explore: "explorer", judge: "judge" } } }, script);

    expect(run.result).toMatchObject({ status: "achieved", verdict: { by: "judge" } });
    expect(run.judgeCalls.length).toBeGreaterThan(0);
    const served = byModel(lane.served);
    expect(new Set(served.filter((call) => call.endsWith(":loop_verification")))).toEqual(new Set(["judge:loop_verification"]));
    expect(new Set(served.filter((call) => !call.endsWith(":loop_verification")))).toEqual(new Set(["explorer:evidence_tool_decision"]));
    expect(lane.served).toHaveLength(run.asked.length);
    // The run's one purse is charged what each call cost at the model that served it, and nothing else.
    const charged = lane.served.reduce((sum, call) => sum + call.costUsd, 0);
    expect(run.result.cost.calls).toBe(lane.served.length);
    expect(run.result.cost.usd).toBeCloseTo(charged, 9);
    expect(run.result.cost.usd).toBeGreaterThan(lane.served.length * 15 * PRICES.explorer);
    // Holds were priced at both models: the judge's at its own, the decisions' at the explore model's.
    expect(new Set(lane.priced)).toEqual(new Set(["explorer", "judge"]));
  });

  it("ends a run whose role model cannot be resolved exactly as an unknown options.model ends it, before any call", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const unknownModel = await lane.run({ spec: judged(), inputs: { title: "Birds" }, options: { model: "no-such-model" } }, script);
    const unknownJudge = await lane.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { judge: "no-such-model" } } }, script);

    for (const ended of [unknownModel, unknownJudge]) {
      expect(ended.asked).toHaveLength(0);
      expect(ended.result.cost).toEqual({ calls: 0, tokens: 0, usd: 0 });
    }
    const outcome = (ended: typeof unknownModel) => ({ status: ended.result.status, failed: ended.events.filter((event) => event.type === "step" && event.state === "failed").map((event) => (event as { label?: string }).label) });
    expect(outcome(unknownJudge)).toEqual(outcome(unknownModel));
    expect(lane.served).toHaveLength(0);
  });

  it("is one model, as before, for a run with no models", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const run = await lane.run({ spec: judged(), inputs: { title: "Birds" } }, script);
    expect(run.result.status).toBe("achieved");
    expect(new Set(lane.served.map((call) => call.model))).toEqual(new Set([LANE_DEFAULT_MODEL]));
    expect(new Set(lane.served.map((call) => call.taskKind))).toEqual(new Set(["evidence_tool_decision", "loop_verification"]));
  });

  it("routes two runs at once each by its own models", async () => {
    const [one, two] = await Promise.all([fluxNodeLane(cleanups, { models: PRICES }), fluxNodeLane(cleanups, { models: PRICES })]);
    const [ranOne, ranTwo] = await Promise.all([
      one.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { explore: "explorer", judge: "judge" } } }, script),
      two.run({ spec: judged(), inputs: { title: "Birds" }, overrides: { models: { explore: "explorer-b", judge: "judge-b" } } }, script)
    ]);
    expect([ranOne.result.status, ranTwo.result.status]).toEqual(["achieved", "achieved"]);
    expect(new Set(byModel(one.served))).toEqual(new Set(["explorer:evidence_tool_decision", "judge:loop_verification"]));
    expect(new Set(byModel(two.served))).toEqual(new Set(["explorer-b:evidence_tool_decision", "judge-b:loop_verification"]));
  });
});
