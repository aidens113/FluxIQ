// @fluxiq-test-group real-sql
// A shared part's repair, through the real service: its run, its stores, its executor and its
// judged end. A version never changes, a repair makes the next one, and only the caller whose
// judged run ran it moves. The host, the repair model and the judge are the fixture's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetProjectPartResponse } from "../../../../../api-contracts/automation.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioRuntimePatch } from "../../../../../runtime/llm/index.ts";
import { automationStudioFlowGraphVersion } from "../../../../../runtime/flow-authoring/version/index.ts";
import { act, callerOf, edge, end, flowOf, keptPart, look, pinnedCall, PRESS_ID, repairWorld, start, subflowOf, type PartGraph, type RepairWorld } from "./repair-isolation-fixture.ts";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

type Step = (id: string) => AutomationStudioFlowNode;

/** start -> each control, in order -> end. */
const line = (prefix: string, ...steps: readonly Step[]): PartGraph => {
  const ids = steps.map((_, index) => `${prefix}.s${index + 1}`);
  const nodes = [start(`${prefix}.start`), ...steps.map((step, index) => step(ids[index]!)), end(`${prefix}.end`)];
  const order = [`${prefix}.start`, ...ids, `${prefix}.end`];
  return { nodes, edges: order.slice(1).map((id, index) => edge(order[index]!, id)) };
};
const looks = (control: string): Step => (id) => look(id, control);
const acts = (control: string): Step => (id) => act(id, control);

const replaced = (nodeId: string, control: string): AutomationStudioRuntimePatch => ({ kind: "replace_unit", unit: { kind: "node", nodeId }, steps: [{ definitionId: PRESS_ID, parameters: { control } }], consequences: [], reason: "Press the control that works now." });
const wholePart = (subflowId: string, controls: readonly string[], consequences: Extract<AutomationStudioRuntimePatch, { kind: "replace_unit" }>["consequences"] = []): AutomationStudioRuntimePatch => ({ kind: "replace_unit", unit: { kind: "part", subflowId }, steps: controls.map((control) => ({ definitionId: PRESS_ID, parameters: { control } })), consequences, reason: "The part works another way now." });

describe("repairing a shared part", () => {
  let world: RepairWorld;
  let projectId = "";

  beforeEach(async () => {
    world = await repairWorld();
    projectId = (await world.service.createProject({ name: "Repair isolation", domainId: "example" })).id;
    await world.service.createFlow({ projectId, flowId: "flow.source", name: "Source" });
  });
  afterEach(async () => {
    await world.close();
  });

  const run = async (flowId: string) => {
    const session = await world.service.runRuntimeSession({ projectId, flowId });
    const detail = await world.service.getFlowRunDetail(projectId, session.runId);
    return { session, detail, receipts: ((detail?.metadata?.inRunRepairs ?? []) as JsonObject[]) };
  };
  const pinOf = async (graphFlowId: string, nodeId: string) => (await world.service.getFlow(projectId, graphFlowId)).nodes.find((node) => node.id === nodeId)?.parameterValues?.part;
  const part = async (partId: string, version?: number) => await world.service.projectParts.get({ projectId, partId, ...(version ? { version } : {}) }) as GetProjectPartResponse;
  const adaptationOf = async (flowId: string, receipt: JsonObject | undefined) => await world.service.getFlowAdaptation(projectId, flowId, String(receipt?.adaptationId));
  /** The saved version's card without its trust, its steps, and the graph a run reads. */
  const frozen = async (partId: string, version: number) => {
    const read = await part(partId, version);
    const { trust: _trust, ...card } = read.card;
    return JSON.stringify({ card, steps: read.steps, graph: await snapshotGraph(partId, version) });
  };
  const snapshotGraph = async (partId: string, version: number) => (await world.service.projectParts.graphs(projectId, "flow.nobody").load({ partId, version }))?.graph.nodes;
  const twoCallers = async (graph: PartGraph) => {
    const shared = await keptPart(world, projectId, "flow.source", "Press the things", graph);
    const pin = { partId: shared.partId, version: shared.version };
    return { shared, pin, one: await callerOf(world, projectId, "flow.one", pin), two: await callerOf(world, projectId, "flow.two", pin) };
  };

  describe("a judged yes", () => {
    it("repairs a pinned step in the run, keeps the fix as the next version, and moves only this caller", async () => {
      const { pin, one, two } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      const otherBefore = JSON.stringify(await world.service.getFlow(projectId, two.graphFlowId));
      const versionBefore = await frozen(pin.partId, 1);
      const graphBefore = await world.service.getFlow(projectId, one.graphFlowId);

      const { session, detail, receipts } = await run(one.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.requests.map((request) => request.taskKind)).toEqual(["runtime_diagnosis", "runtime_patch"]);
      // Held in place: the fix's trial is the next press. Nothing before it is pressed again.
      expect(world.presses).toEqual(["open", "go", "fixed"]);
      expect(session.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
      const adaptation = await adaptationOf(one.flowId, receipts[0]);
      expect(adaptation).toMatchObject({ status: "applied", metadata: { approvalDecision: { applied: true, judgedRunId: session.runId } } });

      // The next version, with its card and what it calls, and this caller at it, by the normal graph write.
      const after = await part(pin.partId);
      expect(after.card.version).toBe(2);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 2 });
      const graphAfter = await world.service.getFlow(projectId, one.graphFlowId);
      expect(graphAfter.updatedAt).toBeGreaterThan(graphBefore.updatedAt);
      expect(graphAfter.nodes.filter((node) => node.id !== "flow.one.call")).toEqual(graphBefore.nodes.filter((node) => node.id !== "flow.one.call"));
      expect(graphAfter.edges).toEqual(graphBefore.edges);
      expect(after.callers.flatMap((caller) => (caller.kind === "flow" ? [[caller.flowId, caller.version]] : []))).toEqual([["flow.one", 2], ["flow.two", 1]]);

      // Versions never change, and another caller's graph is the same bytes.
      expect(await frozen(pin.partId, 1)).toBe(versionBefore);
      expect(JSON.stringify(await world.service.getFlow(projectId, two.graphFlowId))).toBe(otherBefore);
      expect(detail?.summary.failureCounts).toMatchObject({ trueFailures: 1, repairedInRun: 1 });

      // The moved caller runs the new version, and needs no model to.
      world.presses.length = 0;
      world.requests.length = 0;
      const again = await run(one.flowId);
      expect(again.session.status).toBe("succeeded");
      expect(world.presses).toEqual(["open", "fixed"]);
      expect(world.requests).toEqual([]);
    });

    it("on graphs with revisions: the move writes a new revision that stands on read, and the version that failed gets no yes for it", async () => {
      const withRevisions = async (graphFlowId: string, nodeId: string) => {
        const patched = await world.service.applyFlowGraphPatch({ projectId, flowId: graphFlowId, baseRevision: 1, mutationId: `seed.${graphFlowId}`, operations: [{ op: "move_node", nodeId, x: 10, y: 10 }] });
        expect(patched.result.status).toBe("applied");
        return automationStudioFlowGraphVersion({ flow: await world.service.getFlow(projectId, graphFlowId) }).revision!;
      };
      const made = await subflowOf(world, projectId, "flow.source", "Press the things", "utility", line("p", looks("open"), looks("go")));
      const partRevision = await withRevisions(made.graphFlowId!, "p.s1");
      const kept = await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: made.subflowId, name: "Press the things", purpose: "Do the thing for whoever calls it" });
      if (!("saved" in kept) || !kept.saved) throw new Error(JSON.stringify(kept));
      const pin = { partId: kept.partId, version: kept.version };
      const one = await callerOf(world, projectId, "flow.one", pin);
      const two = await callerOf(world, projectId, "flow.two", pin);
      const revisionBefore = await withRevisions(one.graphFlowId, "flow.one.call");
      await withRevisions(two.graphFlowId, "flow.two.call");
      const otherBefore = JSON.stringify(await world.service.getFlow(projectId, two.graphFlowId));
      expect(partRevision).toBeGreaterThan(0);

      // A clean run of the version is its own yes, as it always was.
      await run(two.flowId);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 1)?.trust.counts.judgedYes).toBe(1);
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");

      const { session } = await run(one.flowId);

      expect(session.status).toBe("succeeded");
      const moved = await world.service.getFlow(projectId, one.graphFlowId);
      expect(automationStudioFlowGraphVersion({ flow: moved }).revision).toBe(revisionBefore + 1);
      expect(moved.nodes.find((node) => node.id === "flow.one.call")?.parameterValues?.part, "read back through the graph's own revisions").toEqual({ partId: pin.partId, version: 2 });
      const versions = (await part(pin.partId)).versions;
      expect(versions.find((entry) => entry.version === 1)?.trust.counts, "the run got past it on a fix").toMatchObject({ judgedYes: 1, failures: 0 });
      expect(versions.find((entry) => entry.version === 2)?.trust.counts).toMatchObject({ judgedYes: 1, failures: 0 });
      expect(JSON.stringify(await world.service.getFlow(projectId, two.graphFlowId))).toBe(otherBefore);

      // The other caller fails there too, and gets past it on the newer version: that is the newer version's yes, not the old one's.
      const healed = await run(two.flowId);
      expect(healed.session.status).toBe("succeeded");
      expect(await pinOf(two.graphFlowId, "flow.two.call")).toEqual({ partId: pin.partId, version: 2 });
      const after = (await part(pin.partId)).versions;
      expect(after.find((entry) => entry.version === 1)?.trust.counts.judgedYes).toBe(1);
      expect(after.find((entry) => entry.version === 2)?.trust.counts.judgedYes).toBe(2);
    });

    it("a person's revert puts the step back, and the version stays", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      const { receipts } = await run(one.flowId);
      await world.service.reviewFlowAdaptation({ projectId, flowId: one.flowId, adaptationId: String(receipts[0]?.adaptationId), action: "revert", actorId: "user.aiden" });
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
      expect((await part(pin.partId)).card.version).toBe(2);
      expect((await part(pin.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one")).toMatchObject({ version: 1 });
    });

    it("credits the version that ran, not the one that failed", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      await run(one.flowId);
      const versions = (await part(pin.partId)).versions;
      expect(versions.find((entry) => entry.version === 2)?.trust.counts).toMatchObject({ judgedYes: 1, failures: 0 });
      expect(versions.find((entry) => entry.version === 1)?.trust.counts.judgedYes).toBe(0);
      // A version with verdicts of its own gets no yes for a run that got past it on a fix.
      world.broken.add("fixed");
      world.fix.current = replaced("p.s2", "fixed-again");
      await run(one.flowId);
      const later = (await part(pin.partId)).versions;
      expect(later.find((entry) => entry.version === 2)?.trust.counts.judgedYes).toBe(1);
      expect(later.find((entry) => entry.version === 3)?.trust.counts).toMatchObject({ judgedYes: 1, failures: 0 });
    });

    it("replaces a whole pinned part whose own end says it failed", async () => {
      const graph = line("p", looks("open"), looks("go"));
      graph.nodes = graph.nodes.map((node) => (node.id === "p.end" ? { ...node, parameterValues: { resultStatus: "failed" } } : node));
      const { pin, one } = await twoCallers(graph);
      world.fix.current = wholePart(`part:${pin.partId}:v1`, ["open", "whole"]);

      const { session, receipts } = await run(one.flowId);

      expect(session.status).toBe("succeeded");
      expect(receipts.map((receipt) => receipt.outcome)).toEqual(["overlaid"]);
      expect(world.presses).toEqual(["open", "go", "open", "whole"]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 2 });
      expect((await part(pin.partId)).card.version).toBe(2);
    });

    it("runs a fix held in one call for every later call to that version in the run", async () => {
      const shared = await keptPart(world, projectId, "flow.source", "Press the things", line("p", looks("go")));
      const pin = { partId: shared.partId, version: shared.version };
      const twice = await flowOf(world, projectId, "flow.twice", { nodes: [start("t.start"), pinnedCall("t.a", pin), pinnedCall("t.b", pin), end("t.end")], edges: [edge("t.start", "t.a"), edge("t.a", "t.b"), edge("t.b", "t.end")] });
      world.broken.add("go");
      world.fix.current = replaced("p.s1", "fixed");
      const { session } = await run(twice.flowId);
      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["go", "fixed", "fixed"]);
      expect(world.requests.filter((request) => request.taskKind === "runtime_patch")).toHaveLength(1);
      // Both steps ran it, in the run that was judged, so both moved, to one version.
      expect(await pinOf(twice.graphFlowId, "t.a")).toEqual({ partId: pin.partId, version: 2 });
      expect(await pinOf(twice.graphFlowId, "t.b")).toEqual({ partId: pin.partId, version: 2 });
      expect((await part(pin.partId)).card.version).toBe(2);
    });

    it("keeps two fixes of one run on one line, the second on what the first left", async () => {
      const { pin, one } = await twoCallers(line("p", looks("first"), looks("second")));
      world.broken.add("first");
      world.broken.add("second");
      const asked: AutomationStudioRuntimePatch[] = [replaced("p.s1", "first-fixed"), replaced("p.s2", "second-fixed")];
      Object.defineProperty(world.fix, "current", { get: () => (world.requests.filter((request) => request.taskKind === "runtime_patch").length <= 1 ? asked[0] : asked[1]) });

      const { session } = await run(one.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["first", "first-fixed", "second", "second-fixed"]);
      expect((await part(pin.partId)).card.version).toBe(3);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 3 });
      world.presses.length = 0;
      world.broken.clear();
      await run(one.flowId);
      expect(world.presses, "the newest version holds both fixes").toEqual(["first-fixed", "second-fixed"]);
    });

    it("a fix inside a part another part calls gives both their next version, and moves the Flow's one step", async () => {
      const inner = await keptPart(world, projectId, "flow.source", "Press the inner thing", line("i", looks("go")));
      const outer = await keptPart(world, projectId, "flow.source", "Press around the inner thing", {
        nodes: [start("o.start"), look("o.first", "first"), pinnedCall("o.call", { partId: inner.partId, version: inner.version }), end("o.end")],
        edges: [edge("o.start", "o.first"), edge("o.first", "o.call"), edge("o.call", "o.end")]
      });
      const caller = await callerOf(world, projectId, "flow.one", { partId: outer.partId, version: outer.version });
      world.broken.add("go");
      world.fix.current = replaced("i.s1", "fixed");
      const innerBefore = await frozen(inner.partId, 1);
      const outerBefore = await frozen(outer.partId, 1);

      const { session } = await run(caller.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["first", "go", "fixed"]);
      expect((await part(inner.partId)).card.version).toBe(2);
      const outerAfter = await part(outer.partId);
      expect(outerAfter.card.version).toBe(2);
      expect(outerAfter.calls.map((call) => [call.partId, call.version])).toEqual([[inner.partId, 2]]);
      expect(await pinOf(caller.graphFlowId, "flow.one.call")).toEqual({ partId: outer.partId, version: 2 });
      expect(await frozen(inner.partId, 1)).toBe(innerBefore);
      expect(await frozen(outer.partId, 1)).toBe(outerBefore);
    });
  });

  describe("no judged yes", () => {
    const nothingMoved = async (pin: { partId: string; version: number }, one: { graphFlowId: string }) => {
      expect((await part(pin.partId)).card.version).toBe(1);
      expect((await part(pin.partId)).versions).toHaveLength(1);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
    };

    it("a refuted run writes nothing and moves nothing, and says why", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      world.judge.answer = "no";
      const { session, receipts } = await run(one.flowId);
      await nothingMoved(pin, one);
      expect(session.metadata?.resultVerification).toMatchObject({ performed: true });
      expect(session.metadata?.resultVerification).not.toMatchObject({ verdict: "answers" });
      const adaptation = await adaptationOf(one.flowId, receipts[0]);
      expect(adaptation?.status).not.toBe("applied");
      expect(adaptation?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "refuted" });
    });

    it("an unjudged run writes nothing and moves nothing, and says why", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      world.judge.answer = "unknown";
      const { receipts } = await run(one.flowId);
      await nothingMoved(pin, one);
      // A judge that could not be reached has not said yes. The settle reads a check that was put and did not answer as not answering.
      expect((await adaptationOf(one.flowId, receipts[0]))?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "refuted" });
    });

    it("a failed run writes nothing and moves nothing", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.broken.add("still");
      world.fix.current = replaced("p.s2", "still");
      const { session, receipts } = await run(one.flowId);
      expect(session.status).toBe("failed");
      await nothingMoved(pin, one);
      expect((await adaptationOf(one.flowId, receipts[0]))?.status).not.toBe("applied");
    });

    it("a person applying the fix by hand moves nothing without the run's judged yes", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      world.judge.answer = "no";
      const { receipts } = await run(one.flowId);
      await expect(world.service.reviewFlowAdaptation({ projectId, flowId: one.flowId, adaptationId: String(receipts[0]?.adaptationId), action: "apply", actorId: "user.aiden" })).rejects.toThrow();
      await nothingMoved(pin, one);
    });
  });

  describe("others are told", () => {
    const moveOne = async () => {
      const callers = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      await run(callers.one.flowId);
      world.presses.length = 0;
      world.requests.length = 0;
      return callers;
    };

    it("get-project-part shows each caller's pin, and that a newer version has passed", async () => {
      const { pin } = await moveOne();
      const callers = (await part(pin.partId)).callers;
      expect(callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one")).toEqual(expect.objectContaining({ version: 2 }));
      expect(callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one")).not.toHaveProperty("newer");
      const other = callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.two");
      expect(other).toMatchObject({ version: 1, newer: { version: 2, passedElsewhere: true } });
      expect(other?.newer?.said).toBe("\"Press the things\" is pinned at version 1. Version 2 has passed a judged run elsewhere.");
      expect(other?.newer?.said).not.toContain(pin.partId);
    });

    it("a Flow's run detail says it ran an older pin than one that passed, in plain words", async () => {
      const { pin, two } = await moveOne();
      world.broken.clear();
      const { session, detail } = await run(two.flowId);
      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["open", "go"]);
      expect(await pinOf(two.graphFlowId, "flow.two.call"), "being told moves nothing").toEqual(pin);
      expect(detail?.metadata?.partVersionFacts).toEqual([{ version: 1, newerVersion: 2, said: "This run used version 1 of \"Press the things\". Version 2 has passed a judged run elsewhere." }]);
      expect(JSON.stringify(detail?.metadata?.partVersionFacts)).not.toContain(pin.partId);
    });
  });

  describe("trying the newer version first", () => {
    const keptSubflowId = async () => (await world.service.listFlowSubflowSummaries({ projectId, flowId: "flow.source", limit: 50, offset: 0 })).subflows.find((subflow) => subflow.name === "Press the things")!.subflowId;
    const keptGraphId = async () => (await world.service.getFlowSubflow(projectId, "flow.source", await keptSubflowId()))!.graphFlowId!;
    /** The source's part saved again with these steps. */
    const saveNext = async (...steps: readonly Step[]) => {
      const made = await world.service.getFlow(projectId, await keptGraphId());
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: line("p", ...steps).nodes } });
      return await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: await keptSubflowId() });
    };
    /** Version 2 presses `then` where version 1 presses `first`. */
    const newerSaved = async (first: Step, then: Step) => {
      const callers = await twoCallers(line("p", looks("open"), first));
      expect(await saveNext(looks("open"), then)).toMatchObject({ saved: true, partId: callers.pin.partId, version: 2 });
      return callers;
    };

    it("heals at no repair model call, presses exactly once each, and moves this caller on a judged yes", async () => {
      const { pin, one, two } = await newerSaved(looks("go"), looks("works"));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "model-fix");
      const otherBefore = JSON.stringify(await world.service.getFlow(projectId, two.graphFlowId));

      const { session, receipts } = await run(one.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.requests, "the repair model was never asked").toEqual([]);
      expect(world.presses).toEqual(["open", "go", "open", "works"]);
      expect(session.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
      expect(world.judge.asked).toBe(1);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 2 });
      expect((await part(pin.partId)).card.version, "no version was written: it was there").toBe(2);
      expect(JSON.stringify(await world.service.getFlow(projectId, two.graphFlowId))).toBe(otherBefore);
      expect(await adaptationOf(one.flowId, receipts[0])).toMatchObject({ status: "applied" });
    });

    it("heals another caller at no model call, on the version a repair made for the first", async () => {
      const { pin, one, two } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      await run(one.flowId);
      const oneMoved = JSON.stringify(await world.service.getFlow(projectId, one.graphFlowId));
      world.presses.length = 0;
      world.requests.length = 0;

      const { session } = await run(two.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.requests).toEqual([]);
      expect(world.presses).toEqual(["open", "go", "open", "fixed"]);
      expect(await pinOf(two.graphFlowId, "flow.two.call")).toEqual({ partId: pin.partId, version: 2 });
      expect((await part(pin.partId)).card.version, "no version was written").toBe(2);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 2)?.trust.counts.judgedYes).toBe(2);
      expect(JSON.stringify(await world.service.getFlow(projectId, one.graphFlowId))).toBe(oneMoved);
    });

    it("a newer version whose verdict is no is told of no more, and its caller stays", async () => {
      const { pin, one, two } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      await run(one.flowId);
      world.presses.length = 0;
      world.judge.answer = "no";
      await run(two.flowId);
      expect(await pinOf(two.graphFlowId, "flow.two.call")).toEqual(pin);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 1)?.trust.counts.failures, "the failure is not the old version's").toBe(0);
      expect((await part(pin.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.two")).not.toHaveProperty("newer");
    });

    it("a newer version that passes is not kept without a judged yes, and is not tried again once refuted", async () => {
      const { pin, one } = await newerSaved(looks("go"), looks("works"));
      world.broken.add("go");
      world.judge.answer = "no";
      await run(one.flowId);
      expect(world.presses.slice(0, 4)).toEqual(["open", "go", "open", "works"]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 2)?.trust.counts.failures).toBeGreaterThan(0);
      world.presses.length = 0;
      world.judge.answer = "yes";
      await run(one.flowId);
      expect(world.presses).toEqual(["open", "go"]);
    });

    it("is tried once, and when it fails the normal repair runs against the version the step pins", async () => {
      const { pin, one } = await newerSaved(looks("go"), looks("also-broken"));
      world.broken.add("go");
      world.broken.add("also-broken");
      world.fix.current = wholePart(`part:${pin.partId}:v1`, ["open", "model-fix"]);

      const { session } = await run(one.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["open", "go", "open", "also-broken", "open", "model-fix"]);
      expect(world.requests.filter((request) => request.taskKind === "runtime_patch")).toHaveLength(1);
      // The fix is built on version 1, and is the next version of the line.
      expect((await part(pin.partId)).card.version).toBe(3);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 3 });
      // A failure of the newer version is that version's alone.
      const versions = (await part(pin.partId)).versions;
      expect(versions.find((entry) => entry.version === 2)?.trust.counts.failures).toBe(1);
      expect(versions.find((entry) => entry.version === 1)?.trust.counts.failures).toBe(0);
    });

    it("tries each newer version once, newest first", async () => {
      const callers = await newerSaved(looks("go"), looks("second-broken"));
      expect(await saveNext(looks("open"), looks("third-broken"))).toMatchObject({ saved: true, version: 3 });
      for (const control of ["go", "second-broken", "third-broken"]) world.broken.add(control);

      const { session } = await run(callers.one.flowId);

      expect(session.status).toBe("failed");
      expect(world.presses).toEqual(["open", "go", "open", "third-broken", "open", "second-broken"]);
      expect(await pinOf(callers.one.graphFlowId, "flow.one.call")).toEqual(callers.pin);
    });

    it("is never tried after an act that may have landed: the answer was lost", async () => {
      const { pin, one } = await newerSaved(acts("save"), acts("works"));
      world.lostAnswer.add("save");
      world.fix.current = replaced("p.s2", "model-fix");

      const { session } = await run(one.flowId);

      expect(session.status).toBe("failed");
      expect(world.presses).toEqual(["open", "save"]);
      expect(world.requests.filter((request) => request.taskKind === "runtime_patch"), "nor is a fix asked for past it").toEqual([]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
    });

    it("is never tried after an act that landed: the fix goes on from the step, and the act is not repeated", async () => {
      const shared = await keptPart(world, projectId, "flow.source", "Save then look", line("q", acts("save"), looks("go")));
      const caller = await callerOf(world, projectId, "flow.landed", { partId: shared.partId, version: shared.version });
      const made = await world.service.getFlow(projectId, shared.graphFlowId);
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: line("q", acts("save"), looks("works")).nodes } });
      expect(await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: shared.subflowId })).toMatchObject({ saved: true, version: 2 });
      world.broken.add("go");
      world.fix.current = replaced("q.s2", "model-fix");

      const { session } = await run(caller.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["save", "go", "model-fix"]);
      expect(world.presses, "the newer version never ran").not.toContain("works");
      expect(world.requests.filter((request) => request.taskKind === "runtime_patch")).toHaveLength(1);
    });

    it("inside a part another part calls: the inner step takes the newer version, and the caller's own next version holds it", async () => {
      const inner = await keptPart(world, projectId, "flow.source", "Press the inner thing", line("i", looks("go")));
      const madeInner = await world.service.getFlow(projectId, inner.graphFlowId);
      await world.service.saveFlow({ projectId, flow: { ...madeInner, nodes: line("i", looks("works")).nodes } });
      expect(await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: inner.subflowId })).toMatchObject({ saved: true, partId: inner.partId, version: 2 });
      const outer = await keptPart(world, projectId, "flow.source", "Press around the inner thing", {
        nodes: [start("o.start"), look("o.first", "first"), pinnedCall("o.call", { partId: inner.partId, version: 1 }), end("o.end")],
        edges: [edge("o.start", "o.first"), edge("o.first", "o.call"), edge("o.call", "o.end")]
      });
      const caller = await callerOf(world, projectId, "flow.one", { partId: outer.partId, version: outer.version });
      const outerBefore = await frozen(outer.partId, 1);
      world.broken.add("go");

      const { session } = await run(caller.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.requests).toEqual([]);
      expect(world.presses).toEqual(["first", "go", "works"]);
      const outerAfter = await part(outer.partId);
      expect(outerAfter.card.version).toBe(2);
      expect(outerAfter.calls.map((call) => [call.partId, call.version])).toEqual([[inner.partId, 2]]);
      expect((await part(inner.partId)).card.version, "the inner version was there already").toBe(2);
      expect(await pinOf(caller.graphFlowId, "flow.one.call")).toEqual({ partId: outer.partId, version: 2 });
      expect(await frozen(outer.partId, 1)).toBe(outerBefore);
    });

    it("a version that passed in this run serves a second step pinning the same old version, at no model call", async () => {
      const shared = await keptPart(world, projectId, "flow.source", "Press the things", line("p", looks("go")));
      const pin = { partId: shared.partId, version: shared.version };
      const made = await world.service.getFlow(projectId, shared.graphFlowId);
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: line("p", looks("works")).nodes } });
      expect(await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: shared.subflowId })).toMatchObject({ saved: true, version: 2 });
      const twice = await flowOf(world, projectId, "flow.twice", { nodes: [start("t.start"), pinnedCall("t.a", pin), pinnedCall("t.b", pin), end("t.end")], edges: [edge("t.start", "t.a"), edge("t.a", "t.b"), edge("t.b", "t.end")] });
      world.broken.add("go");

      const { session } = await run(twice.flowId);

      // This pinned the old reading, "tried once, the second step asks a model instead" (presses go, works, go; failed). A version that passed is not one that failed.
      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["go", "works", "go", "works"]);
      expect(world.requests, "no model was asked").toEqual([]);
      expect(await pinOf(twice.graphFlowId, "t.a")).toEqual({ partId: pin.partId, version: 2 });
      expect(await pinOf(twice.graphFlowId, "t.b")).toEqual({ partId: pin.partId, version: 2 });
    });

    it("a version that failed in this run is not tried again by a second step", async () => {
      const shared = await keptPart(world, projectId, "flow.source", "Press the things", line("p", looks("go")));
      const pin = { partId: shared.partId, version: shared.version };
      const made = await world.service.getFlow(projectId, shared.graphFlowId);
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: line("p", looks("also-broken")).nodes } });
      expect(await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: shared.subflowId })).toMatchObject({ saved: true, version: 2 });
      const twice = await flowOf(world, projectId, "flow.twice", { nodes: [start("t.start"), pinnedCall("t.a", pin), pinnedCall("t.b", pin), end("t.end")], edges: [edge("t.start", "t.a"), edge("t.a", "t.b"), edge("t.b", "t.end")] });
      world.broken.add("go");
      world.broken.add("also-broken");

      const { session } = await run(twice.flowId);

      expect(session.status).toBe("failed");
      expect(world.presses.filter((control) => control === "also-broken"), "the newer version ran once in the whole run").toHaveLength(1);
    });

    it("a version's last verdict decides the offer: a failure retires it, and a later success offers it again", async () => {
      const { pin, one } = await newerSaved(looks("go"), looks("works"));
      world.broken.add("go");
      world.judge.answer = "no";
      await run(one.flowId);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 2)?.trust.counts.failures).toBeGreaterThan(0);
      expect((await part(pin.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one"), "not told of a version whose latest verdict is no").not.toHaveProperty("newer");

      // Another caller runs version 2 itself, and a judged run says yes: its newest verdict is now a success.
      const direct = await callerOf(world, projectId, "flow.direct", { partId: pin.partId, version: 2 });
      world.judge.answer = "yes";
      expect((await run(direct.flowId)).session.status).toBe("succeeded");
      const after = (await part(pin.partId)).versions.find((entry) => entry.version === 2)?.trust.counts;
      expect(after).toMatchObject({ judgedYes: 1, failures: 1 });
      expect((await part(pin.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one")).toMatchObject({ newer: { version: 2, passedElsewhere: true } });

      world.presses.length = 0;
      world.requests.length = 0;
      const { session } = await run(one.flowId);
      expect(session.status).toBe("succeeded");
      expect(world.requests, "offered again, at no model call").toEqual([]);
      expect(world.presses).toEqual(["open", "go", "open", "works"]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 2 });
    });

    it("a judge that cannot be reached is not a failure of the version tried", async () => {
      const { pin, one } = await newerSaved(looks("go"), looks("works"));
      world.broken.add("go");
      world.judge.answer = "unknown";
      await run(one.flowId);
      // The promotion still reads such a check as not answering, so nothing moved.
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 2)?.trust.counts, "nothing was said against it").toMatchObject({ failures: 0, judgedYes: 0 });
      expect((await part(pin.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one")).toMatchObject({ newer: { version: 2 } });

      world.presses.length = 0;
      world.judge.answer = "yes";
      const { session } = await run(one.flowId);
      expect(session.status).toBe("succeeded");
      expect(world.presses, "still offered").toEqual(["open", "go", "open", "works"]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 2 });
    });

    it("is not tried past a permission gate, and no fix is asked for in the run: neither grants what was refused", async () => {
      const { pin, one } = await newerSaved(looks("guarded"), looks("works"));
      world.denied.add("guarded");
      world.fix.current = replaced("p.s2", "model-fix");
      const { session } = await run(one.flowId);
      expect(session.status).toBe("failed");
      expect(world.presses, "nothing ran after it, of the newer version or of a fix").toEqual(["open", "guarded"]);
      expect((await part(pin.partId)).card.version).toBe(2);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
    });

    it("is not tried for an item found gone, which no version brings back", async () => {
      const { pin, one } = await newerSaved(looks("row"), looks("works"));
      world.gone.add("row");
      world.fix.current = replaced("p.s2", "model-fix");
      const { session } = await run(one.flowId);
      expect(session.status).toBe("failed");
      expect(world.presses, "nothing ran after it, of the newer version or of a fix").toEqual(["open", "row"]);
      expect((await part(pin.partId)).card.version).toBe(2);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
    });

    it("a newer version that may have landed something and then failed ends the run: nothing runs from a start again", async () => {
      const { one, pin } = await twoCallers(line("p", looks("go")));
      const failing = line("p", acts("save"), looks("next"));
      failing.nodes = failing.nodes.map((node) => (node.id === "p.end" ? { ...node, parameterValues: { resultStatus: "failed" } } : node));
      const made = await world.service.getFlow(projectId, await keptGraphId());
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: failing.nodes, edges: failing.edges } });
      expect(await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: await keptSubflowId() })).toMatchObject({ saved: true, version: 2 });
      world.broken.add("go");
      world.fix.current = wholePart(`part:${pin.partId}:v1`, ["model-fix"]);

      const { session } = await run(one.flowId);

      expect(session.status).toBe("failed");
      expect(world.presses).toEqual(["go", "save", "next"]);
      expect(world.requests.filter((request) => request.taskKind === "runtime_patch"), "the fix would have run the part from its start").toEqual([]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
    });

    it("is never tried after an act that landed, when the part then ends failed by its own word", async () => {
      const failing = line("q", acts("save"), looks("next"));
      failing.nodes = failing.nodes.map((node) => (node.id === "q.end" ? { ...node, parameterValues: { resultStatus: "failed" } } : node));
      const shared = await keptPart(world, projectId, "flow.source", "Save then look", failing);
      const caller = await callerOf(world, projectId, "flow.landed", { partId: shared.partId, version: shared.version });
      const made = await world.service.getFlow(projectId, shared.graphFlowId);
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: line("q", acts("save"), looks("works")).nodes } });
      expect(await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: shared.subflowId })).toMatchObject({ saved: true, version: 2 });

      const { session } = await run(caller.flowId);

      expect(session.status).toBe("failed");
      expect(world.presses, "the act once, and nothing of the newer version").toEqual(["save", "next"]);
    });

    it("a lasting step that surely did nothing does not hold the newer version back", async () => {
      const { pin, one } = await newerSaved(acts("save"), acts("works"));
      world.broken.add("save");
      const { session } = await run(one.flowId);
      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["open", "save", "open", "works"]);
      expect(world.requests).toEqual([]);
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual({ partId: pin.partId, version: 2 });
    });

    it("a part that did something lasting is not replaced whole, which would do it again", async () => {
      const graph = line("q", acts("save"), looks("go"));
      graph.nodes = graph.nodes.map((node) => (node.id === "q.end" ? { ...node, parameterValues: { resultStatus: "failed" } } : node));
      const shared = await keptPart(world, projectId, "flow.source", "Save then look", graph);
      const caller = await callerOf(world, projectId, "flow.landed", { partId: shared.partId, version: shared.version });
      world.fix.current = wholePart(`part:${shared.partId}:v1`, ["save", "model-fix"], ["create_new"]);
      const { session, receipts } = await run(caller.flowId);
      expect(session.status).toBe("failed");
      expect(world.presses).toEqual(["save", "go"]);
      expect(world.requests, "no model was asked").toEqual([]);
      expect(receipts.map((receipt) => receipt.code)).toEqual(["lasting_act_landed"]);
    });

    it("a newer version whose interface changed is a new line, and is never offered to a caller of the old one", async () => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("go")));
      const made = await world.service.getFlow(projectId, await keptGraphId());
      await world.service.saveFlow({ projectId, flow: { ...made, nodes: line("p", looks("open"), looks("works")).nodes, interface: { inputs: [{ id: "extra", name: "An extra value", valueType: { kind: "unknown" }, required: true }], outputs: [] } as unknown as typeof made.interface } });
      const kept = await world.service.projectParts.save({ projectId, flowId: "flow.source", subflowId: await keptSubflowId() });
      expect(kept).toMatchObject({ saved: true, version: 1, status: "created" });
      expect(kept).not.toMatchObject({ partId: pin.partId });
      expect((await part(pin.partId)).versions, "the old line is as it was").toHaveLength(1);
      expect((await part(pin.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.one")).not.toHaveProperty("newer");

      world.broken.add("go");
      const { session } = await run(one.flowId);
      expect(session.status).toBe("failed");
      expect(world.presses).toEqual(["open", "go"]);
    });
  });

  describe("a pinned call that stopped safely", () => {
    const patchRequests = () => world.requests.filter((request) => request.taskKind === "runtime_patch");

    it.each([["a permission gate", "denied"], ["an item gone", "gone"]] as const)("asks no model after the run, at %s", async (_what, which) => {
      const { pin, one } = await twoCallers(line("p", looks("open"), looks("guarded")));
      world[which].add("guarded");
      world.fix.current = replaced("p.s2", "model-fix");
      const { session, detail } = await run(one.flowId);
      expect(session.status).toBe("failed");
      expect(world.requests, "neither the run nor the recovery after it asked").toEqual([]);
      expect(world.presses).toEqual(["open", "guarded"]);
      expect(detail?.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.gate.stopped_safely" });
      expect(await pinOf(one.graphFlowId, "flow.one.call")).toEqual(pin);
    });

    it("still reaches repair for a real broken step inside the called part", async () => {
      const { one } = await twoCallers(line("p", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      const { session } = await run(one.flowId);
      expect(session.status).toBe("succeeded");
      expect(patchRequests()).toHaveLength(1);
    });
  });

  describe("a Flow's own Subflow", () => {
    it("a judged repair of a Subflow in the library gives it the next version, and pinned callers do not move", async () => {
      const source = await flowOf(world, projectId, "flow.owner", { nodes: [start("m.start"), end("m.end")], edges: [edge("m.start", "m.end")] });
      const owned = await keptPart(world, projectId, source.flowId, "Press the owned things", line("o", looks("open"), looks("go")));
      const other = await callerOf(world, projectId, "flow.other", { partId: owned.partId, version: owned.version });
      const mainGraph = await world.service.getFlow(projectId, source.graphFlowId);
      await world.service.saveFlow({ projectId, flow: { ...mainGraph, nodes: [start("m.start"), { id: "m.call", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Call", parameterValues: { subflowId: owned.subflowId, inputs: {} } }, end("m.end")], edges: [edge("m.start", "m.call"), edge("m.call", "m.end")] } });
      const otherBefore = JSON.stringify(await world.service.getFlow(projectId, other.graphFlowId));
      const versionBefore = await frozen(owned.partId, 1);
      world.broken.add("go");
      world.fix.current = replaced("o.s2", "fixed");

      const { session } = await run(source.flowId);

      expect(session.status).toBe("succeeded");
      expect(world.presses).toEqual(["open", "go", "fixed"]);
      expect((await world.service.getFlow(projectId, owned.graphFlowId)).nodes.find((node) => node.id === "o.s2")?.parameterValues?.control, "the Flow's own graph").toBe("fixed");
      expect((await part(owned.partId)).card.version, "the library's next version").toBe(2);
      expect(await frozen(owned.partId, 1)).toBe(versionBefore);
      expect(JSON.stringify(await world.service.getFlow(projectId, other.graphFlowId))).toBe(otherBefore);
      expect((await part(owned.partId)).callers.find((caller) => caller.kind === "flow" && caller.flowId === "flow.other")).toMatchObject({ version: 1, newer: { version: 2 } });
    });

    it("the same repair of a Subflow no one kept writes nothing to the library", async () => {
      const source = await flowOf(world, projectId, "flow.plain", line("m", looks("open"), looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("m.s2", "fixed");
      const { session } = await run(source.flowId);
      expect(session.status).toBe("succeeded");
      expect((await world.service.getFlow(projectId, source.graphFlowId)).nodes.find((node) => node.id === "m.s2")?.parameterValues?.control).toBe("fixed");
      expect((await world.service.projectParts.list({ projectId }) as { parts: unknown[] }).parts).toEqual([]);
    });
  });

  describe("trust", () => {
    it("a kept lasting part with no graph revision earns trust from one judged run, and is then offered", async () => {
      const shared = await keptPart(world, projectId, "flow.source", "Save the draft", line("p", acts("save")));
      const pin = { partId: shared.partId, version: shared.version };
      const caller = await callerOf(world, projectId, "flow.one", pin);
      expect((await part(pin.partId)).card.trust.tier).toBe("unproven");
      const offered = async () => (await world.service.projectParts.shortlist({ projectId, requestWords: "Save the draft", askedClasses: ["create_new"] }))?.parts.map((entry) => entry.partId) ?? [];
      expect(await offered(), "never offered while unproven").toEqual([]);

      expect((await run(caller.flowId)).session.status).toBe("succeeded");

      const trust = (await part(pin.partId)).card.trust;
      expect(trust).toMatchObject({ tier: "provisional", counts: { judgedYes: 1, failures: 0 } });
      expect(await offered()).toEqual([pin.partId]);
    });

    it("a judged no counts against the version the run ran as saved, and a fix held in it earns it nothing", async () => {
      const { pin, one, two } = await twoCallers(line("p", looks("open"), looks("go")));
      world.judge.answer = "no";
      await run(two.flowId);
      expect((await part(pin.partId)).versions[0]?.trust.counts).toMatchObject({ judgedYes: 0, failures: 1 });
      world.judge.answer = "yes";
      world.broken.add("go");
      world.fix.current = replaced("p.s2", "fixed");
      await run(one.flowId);
      expect((await part(pin.partId)).versions.find((entry) => entry.version === 1)?.trust.counts, "got past it on a fix").toMatchObject({ judgedYes: 0, failures: 1 });
    });

    it("a person's run of a part asks no model and repairs nothing", async () => {
      const { pin } = await twoCallers(line("p", looks("go")));
      world.broken.add("go");
      world.fix.current = replaced("p.s1", "fixed");
      // This part names no site, so its run stops at the guard. The runner gives a part's run no repair at all (`../run/`), which the runner's own tests run through.
      expect(await world.service.projectParts.run({ projectId, partId: pin.partId, version: 1 })).toMatchObject({ code: "part.wrong_site" });
      expect(world.requests).toEqual([]);
      expect((await part(pin.partId)).versions).toHaveLength(1);
    });
  });
});
