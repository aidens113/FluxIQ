// @fluxiq-test-group real-sql
// Each FluxNode run is its own execution, with an act record of its own (t909): its lasting act lands
// whatever an earlier run landed, while the saved Flow is still the task's, found by name and spec hash
// and replayed at no model call. A run carrying an earlier run's idempotency key continues that run's
// record, so a retried request never presses again what may have landed. A lending library's card,
// renewed with a note the run is given, stands in for any save; it is none of the Lab's scenarios.
import { parseFluxNodeRunRequest, type FluxNodeEventAnswer, type FluxNodeRunEvent, type FluxNodeSpecInput } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, RENEW_CARD, runNode } from "../../answer-first/tests/fake-library.ts";
import { fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const NAME = "library.renew-card";
const pressCard = (callId = "card") => runNode(callId, RENEW_CARD, {}, ["modify_existing"], { add: true });
const explore = { script: [pressCard(), complete("Renewed the card.")] };
const nothingAsked = (_event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => undefined;

/** A FluxNode whose one act lasts: it renews the card, and takes the note its goal names. No check and no judge, so a run is its own act. */
function renewCardSpec(over: Partial<FluxNodeSpecInput> = {}): FluxNodeSpecInput {
  return {
    name: NAME, runtime: "library", goal: "Renew my library card, noting {note}.", start: "library://account",
    inputs: { type: "object", properties: { note: { type: "string" } }, required: ["note"] },
    scope: { acts: ["change"] }, hasCheck: false, options: { judge: "off" },
    ...over
  };
}

describe("a FluxNode run's lasting act", () => {
  it("lands on each run with other inputs, and the second run replays the saved Flow with no model call", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: renewCardSpec(), inputs: { note: "moving house" } }, { ...explore, answers: nothingAsked });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(lane.library.renewals.card).toBe(1);

    const second = await lane.run({ name: NAME, inputs: { note: "new address" } }, { answers: nothingAsked });
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed", cost: { calls: 0 } });
    expect(second.decisions).toHaveLength(0);
    expect(lane.engineCards).toEqual([RENEW_CARD]);
    expect(lane.library.renewals.card).toBe(2);
  });

  it("lands on each run with the same inputs and no idempotency key: each is a deliberate run", async () => {
    const lane = await fluxNodeLane(cleanups);
    await lane.run({ spec: renewCardSpec(), inputs: { note: "moving house" } }, { ...explore, answers: nothingAsked });
    const second = await lane.run({ name: NAME, inputs: { note: "moving house" } }, { answers: nothingAsked });
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed", cost: { calls: 0 } });
    expect(lane.engineCards).toEqual([RENEW_CARD]);
    expect(lane.library.renewals.card).toBe(2);
  });

  it("is not pressed again by a retry with the same idempotency key, which ends with its result", async () => {
    const lane = await fluxNodeLane(cleanups);
    const request = { spec: renewCardSpec(), inputs: { note: "moving house" }, idempotencyKey: "renew-2030-01" };
    const first = await lane.run(request, { ...explore, answers: nothingAsked });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(lane.library.renewals.card).toBe(1);
    // While this Core holds the run, the key answers it: nothing runs.
    const parsed = parseFluxNodeRunRequest(request);
    if (!parsed.ok) throw new Error("a bad request in the test");
    const again = await lane.fluxNodes.start(OWNER, parsed.value);
    expect(again.ok && again.value.runId).toBe(first.result.runId);
    expect(lane.library.renewals.card).toBe(1);

    // A restart forgets the run, so the retry is a new run; its key and request are the first run's execution.
    lane.restart();
    const retried = await lane.run(request, { answers: nothingAsked });
    expect(retried.result.runId).not.toBe(first.result.runId);
    expect(retried.result.status).toBe("achieved");
    expect(retried.decisions).toHaveLength(0);
    expect(lane.engineCards).toEqual([]);
    expect(lane.library.renewals.card).toBe(1);

    // Another key, or none, is another execution, and lands.
    const other = await lane.run({ ...request, idempotencyKey: "renew-2030-02" }, { answers: nothingAsked });
    expect(other.result).toMatchObject({ status: "achieved", path: "replayed" });
    expect(lane.library.renewals.card).toBe(2);
  });
});
