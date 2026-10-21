// The project ledger's acts written into the build record as they are
// recorded (t551), so a fresh store reading the same directory -- the record
// after a restart -- names every act of the build, with who made it. The ledger is
// the real one; the gate's calls are made as the permission wrapper makes them,
// on a pottery-class sign-up site.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { automationStudioProjectStructurePlan, automationStudioProjectTaskSpec, AutomationStudioProjectBuildRecordStore, type AutomationStudioProjectStructurePlan, type AutomationStudioProjectSubflowBrief } from "../../../project-agents/index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "../acts-record.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER } from "../supervisor-ledger.ts";

const REF = { projectId: "project.pottery", flowId: "flow.pottery", buildId: "build.pottery" };
const SOURCE = "Open the class list and sign me up for the Thursday wheel class.";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function recorded() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-acts-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const projects = new AutomationStudioProjectPaths(root);
  const store = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects));
  const parts = [{ id: "p1", quote: { sourceId: "instruction.1", text: "sign me up for the Thursday wheel class" }, goalFacts: ["signed up for Thursday"], lastingActs: ["create_new" as const] }];
  const spec = { parts, notAsked: [] };
  const taskSpec = { ...spec, digest: automationStudioProjectTaskSpec.digest(spec) };
  const plan: Omit<AutomationStudioProjectStructurePlan, "digest"> = {
    taskSpecDigest: taskSpec.digest,
    plan: { schemaVersion: "0.1", router: { name: "Pottery", rules: [], fallback: { kind: "subflow", targetSubflowKey: "sign_up" } }, subflows: [{ key: "sign_up", name: "Sign up", role: "primary", nodes: [], edges: [], metadata: { "fluxiq.successCheck": [{ fact: "text", op: "contains", value: "Thursday", target: { handle: "t2" } }] } }] } as AutomationStudioProjectStructurePlan["plan"],
    partOf: { sign_up: ["p1"] }
  };
  const structurePlan = { ...plan, digest: automationStudioProjectStructurePlan.digest(plan) };
  await store.create({ ...REF, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] });
  await store.recordTaskSpec(REF, taskSpec, [{ sourceId: "instruction.1", text: SOURCE }]);
  await store.recordPlan(REF, structurePlan);
  const brief: AutomationStudioProjectSubflowBrief = { briefId: "b-sign", kind: "build", planDigest: structurePlan.digest, subflowKey: "sign_up", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.02, maxIterations: 6, permittedActs: ["create_new"] };
  await store.recordBrief(REF, brief);
  await store.recordBrief(REF, { ...brief, briefId: "b-reset", kind: "reset", parts: [], permittedActs: [], maxIterations: 3 });
  return { projects, store };
}

describe("the project ledger's acts in the build record", () => {
  it("preserves the original-baseline capability and issued refs through the actual recording adapter", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const owner = project.forBrief("builder");
    owner.observed({ state: {}, differs: [], resource: "r:one", collections: [{ scope: "p:destination", group: "g:destination", subjects: ["s:existing"], states: { "s:existing": "v:original" } }] });
    const calls = AutomationStudioProjectBuildActsRecord.of(project).calls(owner);
    const ref = calls.destinationReceipts!()[0]!.ref;
    const declaration = { effect: "mutate" as const, consequences: ["create_new" as const], control: { name: null, kind: null, resource: "r:one", subject: "s:document", scope: "p:source" } };
    expect(calls.createBaseline!(declaration, undefined)).toMatchObject({ kind: "refused" });
    expect(calls.createBaseline!(declaration, ref)).toEqual({ kind: "admit" });
    expect(project.snapshot().acts).toEqual([]);
  });
  it("writes each brief's explored and trial acts as they are recorded, with owner and class, readable after a restart", async () => {
    const { projects, store } = await recorded();
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const acts = AutomationStudioProjectBuildActsRecord.of(ledger);
    acts.bind(store, REF);
    const calls = acts.calls(ledger.forBrief("b-sign"));
    calls.explored({ callId: "call.join", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Join class", kind: "button", item: "class:thu" }, verb: "press" } });
    // A look is no act, and is written as none.
    calls.explored({ callId: "call.look", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "observe", consequences: [], control: { name: "Classes", kind: "link" }, verb: "open" } });
    const trialActs = [{ step: 2, definitionId: "web.browser.click", label: "Join", consequences: ["create_new" as const] }];
    ledger.forBrief("b-sign").trialRan(trialActs, "run.trial-1");
    acts.trialRan(trialActs, "run.trial-1");
    await acts.flushed();

    const restarted = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects));
    const view = await restarted.read(REF);
    expect(view!.record.lastingActs).toEqual([
      { recordedAt: expect.any(Number), act: "act-1", owner: { role: "builder", briefId: "b-sign" }, consequences: ["create_new"], description: "act-1: press \"Join class\" button", undoable: true },
      { recordedAt: expect.any(Number), act: "act-2", owner: { role: "builder", briefId: "b-sign" }, consequences: ["create_new"], description: "act-2: trial step 2 \"Join\"", undoable: true }
    ]);
    expect(acts.unrecorded()).toEqual([]);
    // One writer per ledger.
    expect(AutomationStudioProjectBuildActsRecord.of(ledger)).toBe(acts);
  });

  it("writes every act of the build: the supervisor's whole trials, a reset's own act, and one the instruction rather than the brief permitted", async () => {
    const { store } = await recorded();
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const acts = AutomationStudioProjectBuildActsRecord.of(ledger);
    // A whole trial before the record is bound is written once it is.
    const whole = [{ step: 1, definitionId: "web.browser.click", label: "Join", consequences: ["create_new" as const] }];
    ledger.forBrief(AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER).trialRan(whole, "run.whole-1");
    acts.trialRan(whole, "run.whole-1");
    acts.bind(store, REF);
    // The brief was permitted only create_new; paying is the person's own instruction's to permit.
    acts.calls(ledger.forBrief("b-sign")).explored({ callId: "call.pay", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["move_money"], control: { name: "Pay deposit", kind: "button" }, verb: "press" } });
    acts.calls(ledger.forBrief("b-reset")).explored({ callId: "call.note", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Save note", kind: "button" }, verb: "press" } });
    await acts.flushed();
    expect(acts.unrecorded()).toEqual([]);
    expect((await store.read(REF))!.record.lastingActs.map((entry) => [entry.act, entry.owner, entry.consequences, entry.undoable])).toEqual([
      ["act-1", { role: "supervisor" }, ["create_new"], true],
      ["act-2", { role: "builder", briefId: "b-sign" }, ["move_money"], false],
      ["act-3", { role: "builder", briefId: "b-reset" }, ["modify_existing"], true]
    ]);
  });
  // t748: a looped trial step's passes are one act each, written apart with their own words and classes.
  it("writes each pass of a looped trial step as its own act, named by its pass", async () => {
    const { store } = await recorded();
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const acts = AutomationStudioProjectBuildActsRecord.of(ledger);
    acts.bind(store, REF);
    const passes = [1, 2, 3].map((number) => ({ step: number * 2, definitionId: "web.browser.click", label: "Join", consequences: ["create_new" as const], pass: { number, of: 3 } }));
    ledger.forBrief("b-sign").trialRan(passes, "run.trial-1");
    acts.trialRan(passes, "run.trial-1");
    await acts.flushed();
    expect((await store.read(REF))!.record.lastingActs.map((entry) => [entry.act, entry.description, entry.consequences])).toEqual([
      ["act-1", "act-1: trial step 2, pass 1 of 3 \"Join\"", ["create_new"]],
      ["act-2", "act-2: trial step 4, pass 2 of 3 \"Join\"", ["create_new"]],
      ["act-3", "act-3: trial step 6, pass 3 of 3 \"Join\"", ["create_new"]]
    ]);
  });
});
