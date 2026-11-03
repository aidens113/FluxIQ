import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioProjectResetPorts } from "../index.ts";
import { doneOutcome, gardenBrief, gardenBuild, gate, REF, untilAborted, type BuilderScript } from "./dispatch-fixture.ts";

const read = () => gardenBrief("b-read", "list_seeds");
const open = () => gardenBrief("b-open", "open_packet");
const plant = () => gardenBrief("b-plant", "plant_packet", ["list_seeds"]);

/** A builder that waits for `opened` before it returns done. */
const after = (opened: Promise<void>): BuilderScript => async (input) => {
  await opened;
  return await doneOutcome(input);
};

describe("the project dispatcher", () => {
  it("with capacity 2 runs two independent briefs at once, and a dependent third waits for its predecessor", async () => {
    const reading = gate();
    const opening = gate();
    const build = await gardenBuild({ capacity: 2, briefs: [read(), open(), plant()], scripts: { "b-read": after(reading.opened), "b-open": after(opening.opened) } });
    const dispatched = build.run();
    await vi.waitFor(() => expect(build.events).toEqual(["start b-read", "start b-open"]));
    reading.open();
    await vi.waitFor(() => expect(build.events).toContain("start b-plant"));
    // The dependent started only after its predecessor ended, and never above the host's capacity.
    expect(build.events.indexOf("start b-plant")).toBeGreaterThan(build.events.indexOf("end b-read"));
    opening.open();
    const { returns } = await dispatched;
    expect(returns.map((entry) => [entry.briefId, entry.outcome])).toEqual([["b-read", "done"], ["b-open", "done"], ["b-plant", "done"]]);
    expect(build.mostAtOnce()).toBe(2);
    expect(build.host.inUse()).toBe(0);
  });

  it("with capacity 1 runs three briefs one at a time, in the order given", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read(), open(), gardenBrief("b-plant", "plant_packet")] });
    const { returns } = await build.run();
    expect(build.events).toEqual(["start b-read", "end b-read", "start b-open", "end b-open", "start b-plant", "end b-plant"]);
    expect(returns.every((entry) => entry.outcome === "done")).toBe(true);
    expect(build.mostAtOnce()).toBe(1);
  });

  it("gives each builder a lease of its own, its allowance as its purse and its brief's iteration bound", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read(), open()] });
    await build.run();
    for (const seen of build.seen) {
      expect(seen.lease?.holder).toEqual({ role: "builder", briefId: seen.briefId });
      expect(seen.purse?.attribution).toEqual({ role: "builder", briefId: seen.briefId });
      expect(seen.purse?.isClosed()).toBe(true);
      expect(seen.maxIterations).toBe(12);
    }
  });

  it("passes a call scope only when the host runs more than one builder at once", async () => {
    const single = await gardenBuild({ capacity: 1, briefs: [read()] });
    await single.run();
    expect(single.seen[0]!.callScope).toBeUndefined();
    const double = await gardenBuild({ capacity: 2, briefs: [read()] });
    await double.run();
    expect(double.seen[0]!.callScope).toBe("b-read");
  });

  it("ends a brief whose allowance cannot be carved as blocked, and the rest continue", async () => {
    const reading = gate();
    const build = await gardenBuild({ capacity: 2, ceilingUsd: 0.03, briefs: [read(), open()], scripts: { "b-read": after(reading.opened) } });
    const dispatched = build.run();
    await vi.waitFor(() => expect(build.events).toEqual(["start b-read"]));
    // b-open's turn came while b-read's allowance still held $0.02 of the $0.03.
    reading.open();
    const { returns } = await dispatched;
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "done", calls: 1 });
    expect(returns[1]).toMatchObject({ briefId: "b-open", outcome: "blocked", spentUsd: 0, calls: 0 });
    expect(returns[1]!.reason).toContain("could not carve this brief's allowance");
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
  });

  it("ends a throwing builder as blocked, never aborting a sibling", async () => {
    const reading = gate();
    const build = await gardenBuild({ capacity: 2, briefs: [read(), open()], scripts: {
      "b-read": after(reading.opened),
      "b-open": async () => {
        throw new Error("the packet page never loaded");
      }
    } });
    const dispatched = build.run();
    await vi.waitFor(() => expect(build.events).toContain("end b-open"));
    expect(build.seen.find((seen) => seen.briefId === "b-read")!.signal.aborted).toBe(false);
    reading.open();
    const { returns } = await dispatched;
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "done" });
    expect(returns[1]).toMatchObject({ briefId: "b-open", outcome: "blocked", reason: "The builder failed: the packet page never loaded" });
  });

  it("does not start a brief whose predecessor ended blocked", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read(), plant()], scripts: { "b-read": async () => {
      throw new Error("the catalogue was empty");
    } } });
    const { returns } = await build.run();
    expect(returns[1]).toMatchObject({ briefId: "b-plant", outcome: "blocked", calls: 0 });
    expect(returns[1]!.reason).toContain("Brief b-read for subflow list_seeds");
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
  });

  it("does not start a brief whose predecessor ended partial because its trial answered no, and says so", async () => {
    const build = await gardenBuild({ capacity: 2, briefs: [read(), plant()], scripts: { "b-read": async (input) => {
      const outcome = await doneOutcome(input);
      return { ...outcome, trial: { ...outcome.trial!, verdict: "no" } };
    } } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "partial", proposal: { revision: 1 } });
    expect(returns[1]).toMatchObject({ briefId: "b-plant", outcome: "blocked", calls: 0, spentUsd: 0, trials: [] });
    expect(returns[1]!.reason).toContain("Brief b-read for subflow list_seeds");
    expect(returns[1]!.reason).toContain("ended partial: its revision 1 stands, but no trial of it answered yes");
    expect(returns[1]!.reason).toContain("its latest trial answered no");
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
  });

  it("does not start a brief whose predecessor stands untried", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read(), plant()], scripts: { "b-read": async (input) => {
      return { ...(await doneOutcome(input)), trial: undefined };
    } } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ outcome: "partial" });
    expect(returns[1]).toMatchObject({ briefId: "b-plant", outcome: "blocked", calls: 0 });
    expect(returns[1]!.reason).toContain("no trial of it answered yes");
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
  });

  it("does not start a brief whose predecessor ended done without a proposal", async () => {
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [{ toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
        decide: async () => ({ kind: "complete", result: { summary: "nothing to undo" } })
      },
      remainingActs: async () => []
    });
    const undo = gardenBrief("b-undo", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 2, briefs: [undo, plant()], ports: { reset } });
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-undo", outcome: "done" });
    expect(returns[0]).not.toHaveProperty("proposal");
    expect(returns[1]).toMatchObject({ briefId: "b-plant", outcome: "blocked", calls: 0 });
    expect(returns[1]!.reason).toContain("Brief b-undo for subflow list_seeds, which this subflow starts after, ended done without a proposal of its subflow");
    expect(build.seen).toEqual([]);
  });

  it("starts a dependent once its predecessor came back done with a passing trial", async () => {
    const build = await gardenBuild({ capacity: 2, briefs: [read(), plant()] });
    const { returns } = await build.run();
    expect(returns.map((entry) => [entry.briefId, entry.outcome])).toEqual([["b-read", "done"], ["b-plant", "done"]]);
    expect(build.events).toEqual(["start b-read", "end b-read", "start b-plant", "end b-plant"]);
  });

  it("does not start a brief whose predecessor is outside the dispatch and has never returned, naming it and why", async () => {
    const build = await gardenBuild({ capacity: 2, briefs: [read(), plant()] });
    // No brief of list_seeds has returned yet.
    const first = await build.run([plant()]);
    expect(first.returns[0]).toMatchObject({ briefId: "b-plant", outcome: "blocked", calls: 0, spentUsd: 0, trials: [] });
    expect(first.returns[0]!.reason).toContain("Subflow list_seeds, which this subflow starts after, is not in this dispatch and has no proposal whose trial answered yes: no brief of it has returned in this build.");
    expect(build.seen).toEqual([]);
  });

  it("holds back a dependent whose predecessor ended partial in an earlier dispatch", async () => {
    const failing: BuilderScript = async (input) => {
      const outcome = await doneOutcome(input);
      return { ...outcome, trial: { ...outcome.trial!, verdict: "no" } };
    };
    const later = gardenBrief("b-plant-2", "plant_packet", ["list_seeds"]);
    const build = await gardenBuild({ capacity: 2, briefs: [read(), later], scripts: { "b-read": failing } });
    expect((await build.run([read()])).returns[0]).toMatchObject({ outcome: "partial" });
    const { returns } = await build.run([later]);
    expect(returns[0]).toMatchObject({ briefId: "b-plant-2", outcome: "blocked", calls: 0 });
    expect(returns[0]!.reason).toContain("Subflow list_seeds, which this subflow starts after, is not in this dispatch");
    expect(returns[0]!.reason).toContain("its latest brief, b-read, ended partial: its revision 1 stands, but no trial of it answered yes");
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
  });

  it("starts a dependent whose predecessor passed in an earlier dispatch", async () => {
    const later = gardenBrief("b-plant-2", "plant_packet", ["list_seeds"]);
    const build = await gardenBuild({ capacity: 2, briefs: [read(), later] });
    await build.run([read()]);
    const { returns } = await build.run([later]);
    expect(returns[0]).toMatchObject({ briefId: "b-plant-2", outcome: "done" });
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read", "b-plant-2"]);
  });

  it("counts an earlier pass for a predecessor that a later brief of the same dispatch leaves partial", async () => {
    const retry = gardenBrief("b-read-2", "list_seeds");
    const later = gardenBrief("b-plant-2", "plant_packet", ["list_seeds"]);
    const build = await gardenBuild({ capacity: 2, briefs: [read(), retry, later], scripts: { "b-read-2": async (input) => {
      const outcome = await doneOutcome(input);
      return { ...outcome, trial: { ...outcome.trial!, verdict: "no" } };
    } } });
    await build.run([read()]);
    const { returns } = await build.run([retry, later]);
    expect(returns.map((entry) => [entry.briefId, entry.outcome])).toEqual([["b-read-2", "partial"], ["b-plant-2", "done"]]);
    expect(build.events.indexOf("start b-plant-2")).toBeGreaterThan(build.events.indexOf("end b-read-2"));
  });

  it("ends briefs that wait on each other at once instead of waiting forever", async () => {
    const build = await gardenBuild({ capacity: 2, briefs: [gardenBrief("b-read", "list_seeds", ["open_packet"]), gardenBrief("b-open", "open_packet", ["list_seeds"])] });
    const { returns } = await build.run();
    expect(returns.map((entry) => entry.outcome)).toEqual(["blocked", "blocked"]);
    expect(build.seen).toEqual([]);
  });

  it("aborts every builder and every waiter when the Flow is cancelled, each ending as stopped", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read(), open(), plant()], scripts: { "b-read": async (_input, seen) => await untilAborted(seen.signal) } });
    const dispatched = build.run();
    // b-read holds the one lease, b-open waits for it, b-plant waits for b-read.
    await vi.waitFor(() => expect(build.events).toEqual(["start b-read"]));
    expect(build.cancellation.cancel(REF.projectId, REF.flowId)).toBe(true);
    const { returns } = await dispatched;
    expect(returns.map((entry) => entry.outcome)).toEqual(["blocked", "blocked", "blocked"]);
    expect(returns[0]!.reason).toBe("The build was stopped before this brief finished.");
    expect(returns[1]!.reason).toBe("The build was stopped before this brief finished.");
    expect(returns[2]!.reason).toBe("The build was stopped before this brief's turn came.");
    expect(build.seen.map((seen) => seen.briefId)).toEqual(["b-read"]);
    expect(build.host.inUse()).toBe(0);
  });

  it("keeps a proposal a stopped builder had made, as a partial return", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read()], scripts: { "b-read": async (input, seen) => {
      const { proposalFor } = await import("./dispatch-fixture.ts");
      input.accepted?.(proposalFor(input));
      return await untilAborted(seen.signal);
    } } });
    const dispatched = build.run();
    await vi.waitFor(() => expect(build.events).toEqual(["start b-read"]));
    build.cancellation.cancel(REF.projectId, REF.flowId);
    const { returns } = await dispatched;
    expect(returns[0]).toMatchObject({ outcome: "partial", proposal: { subflowKey: "list_seeds", revision: 1, digest: "c".repeat(64) } });
  });

  it("writes every return and every carved allowance to the build record", async () => {
    const build = await gardenBuild({ capacity: 2, briefs: [read(), open(), plant()] });
    const { returns } = await build.run();
    const view = await build.store.read(REF);
    expect(view!.returns.map((entry) => entry.builderReturn)).toEqual(returns);
    expect(view!.record.allowances.map(({ role, briefId, usd }) => ({ role, briefId, usd }))).toEqual(expect.arrayContaining([
      { role: "builder", briefId: "b-read", usd: 0.02 },
      { role: "builder", briefId: "b-open", usd: 0.02 },
      { role: "builder", briefId: "b-plant", usd: 0.02 }
    ]));
    expect(returns.map((entry) => entry.spentUsd)).toEqual([0.001, 0.001, 0.001]);
  });

  it("runs a repair brief as the repair role", async () => {
    const repair = gardenBrief("b-fix", "list_seeds", [], (brief) => Object.assign(brief, { kind: "repair", failingReceipt: { kind: "subflow_trial", receiptId: "run.1", digest: "d".repeat(64) } }));
    const build = await gardenBuild({ capacity: 1, briefs: [repair] });
    const { returns } = await build.run();
    expect(returns[0]!.outcome).toBe("done");
    expect(build.seen[0]!.lease?.holder.role).toBe("repair");
    expect((await build.store.read(REF))!.record.allowances[0]).toMatchObject({ role: "repair", briefId: "b-fix" });
  });

  it("refuses, before anything runs, a brief the record does not hold or a dispatch outside the supervisor's scope", async () => {
    const build = await gardenBuild({ capacity: 1, briefs: [read()] });
    await expect(build.run([read(), open()])).rejects.toMatchObject({ code: "project.brief_unknown" });
    await expect(build.run([read(), read()])).rejects.toMatchObject({ code: "project.duplicate_brief" });
    const { createAutomationStudioProjectDispatcher } = await import("../index.ts");
    await expect(createAutomationStudioProjectDispatcher(build.dispatcherInput)({ briefs: [read()], signal: new AbortController().signal })).rejects.toThrow("supervisor's build scope");
    expect(build.seen).toEqual([]);
  });
});
