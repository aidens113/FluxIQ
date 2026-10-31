// t792: every press the domain answered as a toggle is written into the build
// record as it is recorded, so a fresh store reading the same directory -- the
// record after a restart, or a debug -- names each toggle a later step was held
// to: its node, where it was made (an exploration call's handles, or a trial's
// nodes) and its signature. The record of toggles is the real one, fed as the
// permission wrapper and a trial feed it; the control is a "Pin" button on a
// list of saved notes.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioExploredToggles } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioFlowPlanToggleSteps } from "../../../flow-bootstrap/script-statements/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioProjectStructurePlan, automationStudioProjectTaskSpec, AutomationStudioProjectBuildRecordStore, type AutomationStudioProjectStructurePlan } from "../../../project-agents/index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectBuildTogglesRecord } from "../index.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../../project-build/index.ts";

const REF = { projectId: "project.notes", flowId: "flow.notes", buildId: "build.notes" };
const SOURCE = "Pin the second saved note.";
const PINNED = { via: "name", gains: ["unpin"], loses: ["pin"] };
const UNPINNED = { via: "name", gains: ["pin"], loses: ["unpin"] };

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function recorded() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-toggles-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const projects = new AutomationStudioProjectPaths(root);
  const store = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects));
  const parts = [{ id: "p1", quote: { sourceId: "instruction.1", text: "Pin the second saved note" }, goalFacts: ["the second note is pinned"], lastingActs: ["modify_existing" as const] }];
  const spec = { parts, notAsked: [] };
  const taskSpec = { ...spec, digest: automationStudioProjectTaskSpec.digest(spec) };
  const plan: Omit<AutomationStudioProjectStructurePlan, "digest"> = {
    taskSpecDigest: taskSpec.digest,
    plan: { schemaVersion: "0.1", router: { name: "Notes", rules: [], fallback: { kind: "subflow", targetSubflowKey: "pin_notes" } }, subflows: [{ key: "pin_notes", name: "Pin notes", role: "primary", nodes: [], edges: [], metadata: { "fluxiq.successCheck": [{ fact: "text", op: "contains", value: "Unpin", target: { handle: "t2" } }] } }] } as AutomationStudioProjectStructurePlan["plan"],
    partOf: { pin_notes: ["p1"] }
  };
  await store.create({ ...REF, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] });
  await store.recordTaskSpec(REF, taskSpec, [{ sourceId: "instruction.1", text: SOURCE }]);
  await store.recordPlan(REF, { ...plan, digest: automationStudioProjectStructurePlan.digest(plan) });
  return { projects, store };
}

/** An exploration press of `t4` the domain answered as a toggle, as the permission wrapper records it. */
function explore(toggles: AutomationStudioExploredToggles): void {
  toggles.explored(
    { callId: "call.4", toolId: "core.run_node", value: { node: "demo.press", parameters: { target: { handle: "t4" } }, consequences: ["modify_existing"] } },
    { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, outputs: { toggle: { signature: PINNED, beforeSignature: UNPINNED } }, draft: { actionId: "demo.press", ranWith: { node: "demo.press", parameters: { target: { selector: "li:nth-of-type(1) button.pin" } } } } }
  );
}

/** A trial's pass of the subflow's `pin` step, its outputs as the web domain's runtime path returns them (`../../project-build/tests/project-build-shared-toggles.test.ts`). */
function trialPress(): AutomationStudioNodeAttemptTrace {
  const result: JsonObject = { status: "succeeded", message: "Element clicked.", result: { actionType: "web.dom.click", status: "succeeded", toggle: PINNED }, toggle: { signature: PINNED, beforeSignature: UNPINNED } };
  return {
    attemptId: "attempt.7", nodeId: "node.bootstrap.0123456789abcdef.pin_notes.pin", definitionId: "demo.press", startedAt: 1, finishedAt: 2, status: "succeeded", route: "success",
    inputs: {}, outputs: { outputId: "web.dom.click", ok: true, runtimeCommandId: "command.7", runtimeStatus: "succeeded", result }, effects: []
  } as unknown as AutomationStudioNodeAttemptTrace;
}

describe("the build's toggles in the build record", () => {
  it("are written as they are recorded, from exploring and from a trial, and read back by a fresh store", async () => {
    const { projects, store } = await recorded();
    const toggles = new AutomationStudioExploredToggles();
    const writer = AutomationStudioProjectBuildTogglesRecord.of(toggles);
    explore(toggles);
    // Nothing is written before the record is bound; binding writes what was recorded so far.
    writer.sync();
    writer.bind(store, REF);
    toggles.trial([trialPress()]);
    writer.sync();
    // Asked again, nothing is written twice.
    writer.sync();
    await writer.flushed();
    const fresh = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects));
    const written = (await fresh.read(REF))?.record.toggles;
    expect(written?.map(({ recordedAt: _at, ...toggle }) => toggle)).toEqual([
      { from: "explored", node: "demo.press", callId: "call.4", handles: ["t4"], target: { selector: "li:nth-of-type(1) button.pin" }, signature: PINNED, beforeSignature: UNPINNED },
      { from: "trial", node: "demo.press", handles: [], trialNodes: ["node.bootstrap.0123456789abcdef.pin_notes.pin"], signature: PINNED, beforeSignature: UNPINNED }
    ]);
    expect(writer.unrecorded()).toEqual([]);
  });

  // t792: a trial's press is tied to its step by the parameters its node ran with, so the record keeps them.
  it("keep a trial press's parameters, and a build reloaded from its record ties its steps as before", async () => {
    const { projects, store } = await recorded();
    const toggles = new AutomationStudioExploredToggles();
    const writer = AutomationStudioProjectBuildTogglesRecord.of(toggles);
    writer.bind(store, REF);
    explore(toggles);
    const pin = { target: { selector: "li:nth-of-type(2) button.pin" } };
    toggles.trial([trialPress()], { nodes: [{ id: "node.bootstrap.0123456789abcdef.pin_notes.pin", parameterValues: { ...pin, ensureState: PINNED } }] });
    writer.sync();
    await writer.flushed();
    const fresh = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects));
    const kept = (await fresh.read(REF))?.record.toggles ?? [];
    expect(kept.find((toggle) => toggle.from === "trial")?.trialParameters).toEqual(pin);
    const reloaded = AutomationStudioProjectBuildTogglesRecord.restored(kept);
    expect(reloaded.list()).toEqual(toggles.list());
    // A repair's revision that put another press first: the Pin step is now the second, under a new key.
    const plan = {
      schemaVersion: "0.1", router: { name: "Notes", rules: [], fallback: { kind: "subflow", targetSubflowKey: "pin_notes" } },
      subflows: [{ key: "pin_notes", name: "Pin notes", role: "primary", edges: [], nodes: [
        { key: "pin", definitionId: "demo.press", definitionVersion: "1.0.0", consequences: ["modify_existing"], parameters: { target: { selector: "li:nth-of-type(2) button.archive" } } },
        { key: "s2", definitionId: "demo.press", definitionVersion: "1.0.0", consequences: ["modify_existing"], parameters: { ...pin, ensureState: UNPINNED } }
      ] }]
    } as unknown as AutomationStudioFlowBootstrapPlan;
    const tied = (explored: AutomationStudioExploredToggles) => automationStudioFlowPlanToggleSteps({ plan, explored: explored.list() }).plan.subflows[0]!.nodes.map((node) => node.parameters?.ensureState);
    expect(tied(reloaded)).toEqual([undefined, UNPINNED]);
    expect(tied(reloaded)).toEqual(tied(toggles));
    // Parameters on an exploration press are refused, as an edited record is.
    await expect(store.recordToggle(REF, { from: "explored", node: "demo.press", handles: ["t4"], trialParameters: pin, signature: PINNED })).rejects.toMatchObject({ code: "project.toggle_origin" });
  });

  it("keeps a toggle the record refuses, with the refusal's code, and fails nothing", async () => {
    const { store } = await recorded();
    await store.end(REF, { outcome: "blocked", reason: "The person stopped the build." });
    const toggles = new AutomationStudioExploredToggles();
    const writer = AutomationStudioProjectBuildTogglesRecord.of(toggles);
    writer.bind(store, REF);
    explore(toggles);
    writer.sync();
    await writer.flushed();
    expect(writer.unrecorded()).toEqual(["demo.press (project.record_ended)"]);
  });

  it("refuse a stored toggle whose origin and trial nodes disagree, as an edited record is refused", async () => {
    const { store } = await recorded();
    await expect(store.recordToggle(REF, { from: "trial", node: "demo.press", handles: [], signature: PINNED })).rejects.toMatchObject({ code: "project.toggle_origin" });
    await expect(store.recordToggle(REF, { from: "explored", node: "demo.press", handles: ["t4"], signature: {} })).rejects.toMatchObject({ code: "project.not_object" });
    expect((await store.read(REF))?.record.toggles).toBeUndefined();
  });

  it("are one record per build: its trial environment's, else one kept for that environment", () => {
    const carried = new AutomationStudioExploredToggles();
    expect(AutomationStudioProjectBuildTogglesRecord.toggles({ exploredToggles: carried } as unknown as AutomationStudioProjectBuildTrialEnvironment)).toBe(carried);
    const bare = {} as AutomationStudioProjectBuildTrialEnvironment;
    const kept = AutomationStudioProjectBuildTogglesRecord.toggles(bare);
    expect(AutomationStudioProjectBuildTogglesRecord.toggles(bare)).toBe(kept);
    expect(AutomationStudioProjectBuildTogglesRecord.toggles({} as AutomationStudioProjectBuildTrialEnvironment)).not.toBe(kept);
  });
});
