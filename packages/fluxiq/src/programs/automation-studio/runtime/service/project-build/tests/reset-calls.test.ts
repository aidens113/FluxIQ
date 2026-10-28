import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
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
    expect(second.createBaseline!({ ...declaration, control: { ...declaration.control, resource: "r:other" } }, ref)).toMatchObject({ kind: "refused" });
    second.explored(add);
    const late = { ...read([]), resource: "r:one", scope: "p:late-page", location: "late", collections: [{ ...read([]).collections[0]!, scope: "p:late", group: "g:late" }] };
    first.observed(late);
    expect(first.destinationReceipts!()).toEqual([]);
    const third = automationStudioProjectBuildResetCalls(project, project.forBrief("third"));
    expect(third.createBaseline!(declaration, ref)).toEqual({ kind: "admit" });
    expect(third.createBaseline!(declaration, "destination-2")).toMatchObject({ kind: "refused" });
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


it("does not create original project authority from first observations after a lasting act", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const owner = project.forBrief("builder");
  const builder = automationStudioProjectBuildResetCalls(project, owner);
  builder.explored(add);
  builder.observed(read([]));
  const whole = project.forBrief("supervisor");
  whole.trialRan([{ step: 1, definitionId: "demo.add", consequences: ["create_new"], spot: { subject: "s:document" } }]);
  const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("reset"));
  reset.observed(read(["s:document"]));
  expect(reset.target("act-2", deletion)).toMatchObject({ kind: "refused" });
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

  it("answers a repeat of a settled act's undo with the other brief's open act, not an empty list", () => {
    const { first, reset } = twoBriefs();
    // A look naming act-1 under undoes with the list's ref, then that list read complete and unchanged: act-1 is left.
    expect(reset.claim("act-1", "destination-1")).toMatchObject({ kind: "undo" });
    reset.explored({ callId: "look", toolId: "core.run_node", undoes: "act-1", resetDestination: "destination-1", landed: true });
    reset.observed(recipes(["s:soup", "s:stew"]));
    expect(reset.standing("act-1")).toBe("unchanged");
    expect(first.inPlace()).toEqual([]);
    const repeat = reset.claim("act-1", "destination-1");
    expect(repeat).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept" } });
    const acts = repeat.kind === "refused" ? repeat.evidence.actsToUndo as Array<{ act: string; settle?: string }> : [];
    expect(acts.map((act) => act.act)).toEqual(["act-2"]);
    expect(acts[0]!.settle).toContain("resetDestination");
  });

  it("answers an unknown act, claimed or targeted, with every open act and words that say some are listed", () => {
    const { reset } = twoBriefs();
    const unknown = reset.claim("act-9");
    expect(unknown).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
    const evidence = unknown.kind === "refused" ? unknown.evidence : {};
    expect((evidence.actsToUndo as Array<{ act: string }>).map((act) => act.act)).toEqual(["act-1", "act-2"]);
    expect(String(evidence.instruction)).toContain("Name one of the acts listed here");
    const targeted = reset.target("act-9", { effect: "mutate", consequences: ["modify_existing"], control: { subject: "s:pie" } });
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
