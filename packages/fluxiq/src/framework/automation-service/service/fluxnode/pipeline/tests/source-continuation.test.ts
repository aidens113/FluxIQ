// @fluxiq-test-group real-sql
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, RENEW_CARD, runNode } from "../../../answer-first/tests/fake-library.ts";
import { findLoans, findLoansSpec, fluxNodeLane } from "../../tests/library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const SOURCE = "library.source-rows";
const SAVE = "library.save-source-row";
const press = () => runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true });
const saver = () => ({ name: SAVE, runtime: "library", start: "library://account", goal: "Renew the card, noting {note}.", inputs: { type: "object", properties: { note: { type: "string" } }, required: ["note"] }, scope: { acts: ["change"] }, options: { judge: "off" } });
const sourceSpec = () => findLoansSpec({ name: SOURCE, hasCheck: false, options: { judge: "off" }, outputs: { type: "array", items: { type: "object", properties: { title: { type: "string" }, due: { type: "string" } }, required: ["title", "due"] } } });

describe("a pipeline's original source enumeration", () => {
  it("keeps equal occurrences and original non-identity values across reordered source data and full Core restart", async () => {
    const lane = await fluxNodeLane(cleanups);
    lane.library.loans = [
      { title: "first title", due: "2030-01-01" },
      { title: "second title", due: "2030-01-01" },
      { title: "last title", due: "2030-01-03" }
    ];
    const original = structuredClone(lane.library.loans);
    const learned = await lane.run({ spec: sourceSpec(), inputs: { title: "" } }, { script: [findLoans(""), complete("Read the source rows.")] });
    expect(learned.result.outputs).toEqual(original);
    await lane.run({ spec: saver(), inputs: { note: "learn" } }, { script: [press(), complete("Saved.")] });
    const request = {
      pipeline: { name: "library.frozen-source", source: { kind: "flow", target: { fluxNode: SOURCE }, inputs: { title: { value: "" } } }, steps: [
        { id: "save", kind: "map", target: { fluxNode: SAVE }, inputs: { note: { value: "equal note" } }, concurrency: 1, as: "saved" }
      ] }, inputs: {}, idempotencyKey: "frozen-source"
    };
    const first = await lane.run(request);
    expect(first.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(4);
    const reads = lane.engineFinds.length;
    lane.library.loans = [...original].reverse().map((row) => ({ ...row, due: "2040-12-31" }));
    lane.library.loans.push({ title: "newly added title", due: "2040-12-31" });
    await lane.restartCore();
    const retried = await lane.run(request);
    expect(retried.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(4);
    expect(retried.asked).toHaveLength(0);
    expect(lane.engineFinds).toHaveLength(reads);
    expect((retried.result.outputs as { title: string; due: string }[]).map(({ title, due }) => ({ title, due }))).toEqual(original);
    for (const attempt of [2, 3, 4]) {
      const beganAt = Date.now();
      const fresh = await lane.run({ name: "library.frozen-source", inputs: {} });
      expect(fresh.result).toMatchObject({ status: "achieved", path: "replayed", flowId: first.result.flowId, cost: { calls: 0 } });
      expect(fresh.asked).toHaveLength(0);
      expect(lane.library.renewals.card).toBe(4 * attempt);
      expect((fresh.result.outputs as { due: string }[]).map((row) => row.due)).toEqual(["2040-12-31", "2040-12-31", "2040-12-31", "2040-12-31"]);
      console.info("t909 pipeline continuation", JSON.stringify({ path: fresh.result.path, flow: fresh.result.flowId, calls: fresh.result.cost.calls, ms: Date.now() - beganAt }));
    }
  });
});
