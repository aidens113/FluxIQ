// @fluxiq-test-group real-sql
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AuthoringExecutionScope, invokeAuthoringExecutionCallback } from "../../../../../../runtime/flow-authoring/execution/observation/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../../runtime/execution-observation/policies/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../../framework/persistence/project/execution-admission/index.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetLedger, type AutomationStudioSiteResetProjectSnapshot } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioProjectBuildDocuments } from "../../../project-agents/record/index.ts";
import { AutomationStudioProjectWriteCompletion, invokeAutomationStudioProjectWriteCallback } from "../../../project-agents/record-completion/index.ts";
import { queuedWriterFixture } from "../../../project-agents/record-completion/tests/fixture.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { automationStudioProjectBuildResetCalls } from "../reset-calls.ts";

const read = (subjects: string[]) => ({ state: {}, differs: [], scope: "p:destination", location: "destination", subjects, collections: [{ scope: "p:destination", group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) }] });
const add = { callId: "add", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate" as const, consequences: ["create_new" as const], control: { name: "Add", kind: "button", subject: "s:document" }, verb: "press" } };
const deletion = { effect: "mutate" as const, consequences: ["delete" as const], control: { subject: "s:document", scope: "p:destination" } };

describe("project reset observation routing", () => {
  it("shares issued original creation receipts across owners and refuses new post-effect or foreign-resource authority", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const first = automationStudioProjectBuildResetCalls(project, project.forBrief("first"));
    first.observed({ ...read([]), resource: "r:one" });
    const ref = first.destinationReceipts!()[0]!.ref;
    const second = automationStudioProjectBuildResetCalls(project, project.forBrief("second"));
    const declaration = { ...add.declared, control: { ...add.declared.control, resource: "r:one", scope: "p:source" } };
    expect(second.createBaseline!(declaration, ref)).toEqual({ kind: "admit" });
    // t775: the exploration door admits a press with no witness; a ref of another resource is still no witness for it.
    expect(second.createBaseline!({ ...declaration, control: { ...declaration.control, resource: "r:other" } }, ref)).toEqual({ kind: "admit" });
    second.explored(add);
    const late = { ...read([]), resource: "r:one", scope: "p:late-page", location: "late", collections: [{ ...read([]).collections[0]!, scope: "p:late", group: "g:late" }] };
    first.observed(late);
    // t775: an act with no witness seals no group, so a complete read after it still issues a ref a later step can name.
    expect(first.destinationReceipts!().map((receipt) => receipt.ref)).toEqual(["destination-2"]);
    const third = automationStudioProjectBuildResetCalls(project, project.forBrief("third"));
    expect(third.createBaseline!(declaration, ref)).toEqual({ kind: "admit" });
    expect(third.createBaseline!(declaration, "destination-2")).toEqual({ kind: "admit" });
  });
  // t751 (R3 door 2): a plan step's admission is the brief's own ledger's, whoever else's acts its undos are routed to.
  it("forwards a plan step's admission to the brief's own ledger, its answer unchanged", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const own = project.forBrief("builder");
    const asked: Array<{ self: unknown; args: unknown[] }> = [];
    const stamp = { via: "destination", ref: "destination-1" };
    Object.assign(own, { admitStep(this: unknown, ...args: unknown[]) {
      asked.push({ self: this, args });
      return stamp;
    } });
    const calls = automationStudioProjectBuildResetCalls(project, own) as { admitStep?: (declared: unknown, definitionId: string) => unknown };
    const declared = { effect: "mutate", consequences: ["delete"], control: { name: null, kind: null, scope: "p:destination" } };
    expect(calls.admitStep?.(declared, "example.remove")).toBe(stamp);
    expect(asked).toEqual([{ self: own, args: [declared, "example.remove"] }]);
  });

  it("keeps the builder's pre-effect destination witness and routes reset observations back to its owner", async () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = project.forBrief("builder");
    const building = automationStudioProjectBuildResetCalls(project, builder);
    building.observed(read([]));
    building.explored(add);
    const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("reset"));
    reset.observed(read(["s:document"]));
    expect(reset.target("act-1", deletion)).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
    reset.explored({ ...add, callId: "undo", undoes: "act-1", on: "subject", declared: { ...add.declared, consequences: ["delete"], control: { name: "Remove", kind: "button", ...deletion.control } } });
    reset.observed(read([]));
    expect(await builder.beforeTrial(async () => ({ moved: false }))).toEqual({ kind: "admit" });
  });

  it("never seeds another builder's baseline from observations of an independent resource", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const other = project.forBrief("other");
    other.explored({ ...add, declared: { ...add.declared, consequences: [] } });
    const first = automationStudioProjectBuildResetCalls(project, project.forBrief("first"));
    const independent = read([]);
    independent.scope = "p:independent";
    independent.collections[0]!.scope = "p:independent";
    independent.collections[0]!.group = "g:independent";
    first.observed(independent);
    other.explored(add);
    const second = automationStudioProjectBuildResetCalls(project, other);
    second.observed(read(["s:document"]));
    const act = other.actOf("add")!;
    expect(second.target(act, deletion)).toMatchObject({ kind: "refused" });
  });
});


// t775: a strict act with no witness seals no group, so a complete read after it is an original; what it lacks before a later
// act is that act's to remove, and nothing read in it -- all that existed then, before or of the build -- is ever removed.
it("takes a complete read after an unwitnessed act as an original for later acts, whose own subject an undo may then remove", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const owner = project.forBrief("builder");
  const builder = automationStudioProjectBuildResetCalls(project, owner);
  builder.explored(add);
  builder.observed(read([]));
  const whole = project.forBrief("supervisor");
  whole.trialRan([{ step: 1, definitionId: "demo.add", consequences: ["create_new"], spot: { subject: "s:document" } }]);
  const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("reset"));
  reset.observed(read(["s:document"]));
  expect(reset.target("act-2", deletion)).toMatchObject({ kind: "admit", on: "subject" });
});

// Rerun round 3 (office `run-mvgo5xft-25460ba2`, 0110): a refused claim routed
// to the act's owner listed only that owner's open acts (`actsToUndo: []`
// while another brief's acts were open). The routing answers with the whole
// build's open acts. A generic recipe site: two briefs each pressed a control
// that sits in no list read complete, so each act is open until a list is
// named for it.
describe("a refused claim lists the whole build's open acts", () => {
  const recipes = (subjects: string[]) => ({ ...read(subjects), resource: "r:recipes", location: "loc:recipes", collections: [{ ...read(subjects).collections[0]!, scope: "p:recipes", group: "g:recipes" }], scope: "p:recipes-page" });
  const rate = (callId: string, subject: string) => ({ callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate" as const, consequences: ["modify_existing" as const], control: { name: "Rate", kind: "button", subject, page: subject, resource: "r:recipes" }, verb: "press" } });
  const twoBriefs = () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const first = project.forBrief("brief.first");
    const second = project.forBrief("brief.second");
    const routing = automationStudioProjectBuildResetCalls(project, first);
    routing.observed(recipes(["s:soup", "s:stew"]));
    expect(routing.destinationReceipts!().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    first.explored(rate("rate-soup", "s:pie"));
    second.explored(rate("rate-stew", "s:tart"));
    const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("brief.reset"));
    return { project, first, second, reset };
  };

  it("lists every brief's open act, each with its settle, as the trial gate does", () => {
    const { reset } = twoBriefs();
    const open = reset.openActs();
    expect(open.map((act) => act.act)).toEqual(["act-1", "act-2"]);
    for (const act of open) expect(act.settle).toContain("resetDestination");
  });

  it("answers a repeat of a settled act's undo with the other brief's open act, not an empty list", async () => {
    const { first, reset } = twoBriefs();
    // A look naming act-1 under undoes with the list's ref, then that list read complete and unchanged: act-1 is left.
    expect(reset.claim("act-1", "destination-1")).toMatchObject({ kind: "undo" });
    reset.explored({ callId: "look", toolId: "core.run_node", undoes: "act-1", resetDestination: "destination-1", landed: true });
    reset.observed(recipes(["s:soup", "s:stew"]));
    expect(reset.standing("act-1")).toBe("unchanged");
    expect(first.inPlace()).toEqual([]);
    const repeat = await reset.claim("act-1", "destination-1");
    expect(repeat).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
    const acts = repeat.kind === "refused" ? repeat.evidence.actsToUndo as Array<{ act: string; settle?: string }> : [];
    expect(acts.map((act) => act.act)).toEqual(["act-2"]);
    expect(acts[0]!.settle).toContain("resetDestination");
  });

  it("answers an unknown act, claimed or targeted, with every open act and words that say some are listed", async () => {
    const { reset } = twoBriefs();
    const unknown = await reset.claim("act-9");
    expect(unknown).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
    const evidence = unknown.kind === "refused" ? unknown.evidence : {};
    expect((evidence.actsToUndo as Array<{ act: string }>).map((act) => act.act)).toEqual(["act-1", "act-2"]);
    expect(String(evidence.instruction)).toContain("Name one of the acts listed here");
    const targeted = await reset.target("act-9", { effect: "mutate", consequences: ["modify_existing"], control: { subject: "s:pie" } });
    const listed = targeted.kind === "refused" ? targeted.evidence.actsToUndo as Array<{ act: string }> : [];
    expect(listed.map((act) => act.act)).toEqual(["act-1", "act-2"]);
  });

  // t743 (S2): an act no call can settle -- here a press in a build that never read a list, so nothing can be named for
  // it -- is never one to undo, but it is still on the site: a refusal listing the build's acts lists it apart.
  it("lists the whole build's acts no call can settle apart, never among those to undo", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    project.forBrief("brief.first").explored(rate("rate-pie", "s:pie"));
    expect(project.unsatisfiable().map((act) => act.act)).toEqual(["act-1"]);
    const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("brief.reset"));
    const unknown = reset.claim("act-9");
    expect(unknown).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act", actsToUndo: [], actsUnsettleable: [{ act: "act-1", reason: "gate_unsatisfiable" }] } });
    expect(reset.openActs()).toEqual([]);
  });
});

describe("the observed project reset facade", () => {
  it("awaits its actual owner sink and held SQL commit before acknowledging exploration", async () => sqlAdmissionFixture(async sql => {
    const held = await heldProject(sql.root);
    const own = held.project.forBrief("builder.actual");
    const calls = automationStudioProjectBuildResetCalls(held.project, own);
    expect(calls.observed(read([]))).toBeUndefined();
    const f = await queuedWriterFixture(sql.store, "owned.reset-facade:" + sql.root);
    let completed = false;
    const work = f.run({ receiver: calls, callback: calls.explored, args: [add] }, calls).then(value => {
      completed = true;
      return value;
    });
    try {
      await Promise.race([held.entered, work.then(() => { throw new Error("The facade returned before its original persist callback entered."); })]);
      expect(completed).toBe(false);
      expect(held.commits()).toBe(0);
      held.release();
      await expect(work).resolves.toBeUndefined();
    } finally {
      held.release();
      await Promise.allSettled([work]);
    }
    expect(held.commits()).toBe(1);
    expect(f.released()).toBe(true);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
    expect(await held.documents.read(held.ref, "ledger")).toEqual(held.project.snapshot());
    expect(AuthoringExecutionScope.of(calls)).toBeUndefined();
    expect(AuthoringExecutionScope.of(own)).toBeUndefined();
  }));

  it("preserves an unsupported owner's first fulfilled result and durably blocks its second write", async () => sqlAdmissionFixture(async sql => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const own = project.forBrief("builder.actual");
    let writes = 0;
    let actualReceiver: unknown;
    let actualArgument: unknown;
    own.explored = function (this: AutomationStudioSiteResetLedger, call) {
      actualReceiver = this;
      actualArgument = call;
      writes++;
      return Promise.resolve();
    };
    const calls = automationStudioProjectBuildResetCalls(project, own);
    const resource = "owned.reset-unsupported:" + sql.root;
    const f = await queuedWriterFixture(sql.store, resource);
    await expect(f.run({ receiver: calls, callback: calls.explored, args: [add] }, calls)).resolves.toBeUndefined();
    expect(actualReceiver).toBe(own);
    expect(actualArgument).toBe(add);
    expect(writes).toBe(1);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    await reopenedRefusal(sql.root, resource);
    expect(writes).toBe(1);
  }));

  it("observes the actual project snapshot override instead of trusting a data-shaped result", async () => sqlAdmissionFixture(async sql => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const own = project.forBrief("builder.actual");
    const original = project.snapshot();
    let writes = 0;
    project.snapshot = function (this: AutomationStudioSiteResetProjectLedger) {
      expect(this).toBe(project);
      writes++;
      return original;
    };
    const calls = automationStudioProjectBuildResetCalls(project, own);
    const resource = "owned.reset-data-override:" + sql.root;
    const f = await queuedWriterFixture(sql.store, resource);
    await expect(f.run({ receiver: calls, callback: calls.openActs, args: [] }, calls)).resolves.toEqual([]);
    expect(writes).toBe(1);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    await reopenedRefusal(sql.root, resource);
    expect(writes).toBe(1);
  }));

  it("retains current scope on real claims, targets and complete build-wide refusal projection", async () => sqlAdmissionFixture(async sql => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const own = project.forBrief("builder.actual");
    own.explored({ ...add, declared: { ...add.declared, consequences: ["modify_existing"] } });
    const calls = automationStudioProjectBuildResetCalls(project, project.forBrief("reset.actual"));
    const original = Object.freeze({});
    const frame = {
      async run() {
        const claim = await invokeAuthoringExecutionCallback(original, { receiver: calls, callback: calls.claim, args: ["act.missing", undefined] });
        const target = await invokeAuthoringExecutionCallback(original, { receiver: calls, callback: calls.target, args: ["act.missing", deletion] });
        return { claim, target };
      }
    };
    ExecutionCallbackPolicies.remember(frame, frame.run, "frame");
    const f = await queuedWriterFixture(sql.store, "owned.reset-refusal:" + sql.root);
    const result = await f.run({ receiver: frame, callback: frame.run, args: [] }, original);
    expect(result.claim).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act", actsToUndo: [], actsUnsettleable: [{ act: "act-1" }] } });
    expect(result.target).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act", actsToUndo: [], actsUnsettleable: [{ act: "act-1" }] } });
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  }));
});

async function heldProject(root: string) {
  await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const projects = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
  const documents = new AutomationStudioProjectBuildDocuments(projects, new AutomationStudioFlowPaths(projects));
  const ref = { projectId: "project.isolated", flowId: "flow.actual", buildId: "build.actual" };
  let release!: () => void;
  let announce!: () => void;
  let commits = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { announce = resolve; });
  const persist = function (this: undefined, snapshot: AutomationStudioSiteResetProjectSnapshot): Promise<void> {
    const frame = AutomationStudioProjectWriteCompletion.capture(snapshot);
    const change = (): JsonObject => JSON.parse(JSON.stringify(snapshot));
    ExecutionCallbackPolicies.rememberLexical(change, "pure");
    const child = Object.freeze({});
    const args: Parameters<typeof documents.update> = [ref, "ledger", change, child];
    const call = { receiver: documents, callback: documents.update, args };
    announce();
    const returned = gate.then(() => invokeAutomationStudioProjectWriteCallback(frame, call, child)).then(() => {
      commits++;
      completion.completed(returned, frame, { disposition: "settled", completionDigest: "fixture.actual-held-document-commit", assessmentDigest: "fixture.original-owner-completed" });
    });
    return returned;
  };
  const completion = AutomationStudioProjectWriteCompletion.for(undefined, persist);
  return { project: new AutomationStudioSiteResetProjectLedger({ persist }), documents, ref, entered, release, commits: () => commits };
}

async function reopenedRefusal(root: string, resource: string): Promise<void> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
  try {
    const next = await sqlAdmissionAuthority(store, { resources: [resource], series: true, epoch: "epoch.reopened", runId: "run.reopened" });
    await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  } finally {
    await store.close();
    await pool.closeAll();
  }
}
