import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../../site-reset/index.ts";

// The step door (t751, R3): at submission the ledger's `admitStep` asks the one admission of a lasting plan step's
// declaration and answers the stamp its node carries -- `via` and the ref or act it names, nothing opaque -- or none. Before
// a trial runs its steps, a project build's reset (`admit`) refuses it unrun while any reversible lasting step lacks a stamp
// that still resolves. Made-up fixtures only: a recipe box, opaque tokens.

const SITE = "r:site";
const boxPage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:box-page", location: "loc:box", collections: [
  { scope: "p:cards", group: "g:box", subjects: ["s:soup", "s:stew"], states: { "s:soup": "v:soup", "s:stew": "v:stew" } }
] });
const declared = (control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[]) => ({ effect: "mutate" as const, consequences, control: { name: "Press", kind: "button", ...control } });
const pressed = (callId: string, control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, verb: "press", ...declared(control, consequences) }, ...extra });
/** A new card made in the box's own list: an identified creation whose own scope's original lacks it. */
const NEW_CARD: AutomationStudioSiteResetSpot = { subject: "s:bread", page: "s:bread", scope: "p:cards", resource: SITE };
/** A row of the box's list. */
const ROW: AutomationStudioSiteResetSpot = { subject: "s:soup", item: "i:soup", scope: "p:cards", resource: SITE };
/** A star stating its state at its place, about a card's own page. */
const STAR: AutomationStudioSiteResetSpot = { subject: "s:jam", page: "s:jam", resource: SITE, place: "pl:star", state: "st:off" };
/** A draft started from a detail page in no list. */
const DRAFT: AutomationStudioSiteResetSpot = { subject: "s:pie", page: "s:pie", resource: SITE };
const boxed = (ledger = new AutomationStudioSiteResetLedger()): AutomationStudioSiteResetLedger => {
  ledger.observed(boxPage());
  expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
  return ledger;
};

describe("the step door answers a stamp (admitStep)", () => {
  it("refuses unidentified project exploration and never accepts a legacy project step", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = project.forBrief("builder");
    const unidentified = declared({}, ["modify_existing"]);
    expect(builder.createBaseline(unidentified, undefined)).toMatchObject({ kind: "refused", evidence: { failed: "no_target_identity", canMeet: "no_call" } });
    expect(builder.admitStep(unidentified)).toBeUndefined();
    expect(project.stepWitnessResolves({ via: "legacy" })).toBe(false);
    const reset = automationStudioSiteResetProjectReset({ project, own: builder, checks: () => ({ compare: async () => ({ moved: false }) }) });
    for (const witness of [{ via: "control" }, { via: "control", ref: "control-99" }, { via: "own_list" }]) {
      expect(reset.admit?.([{ step: 1, consequences: ["modify_existing"], witness }])).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_step_unwitnessed" } });
    }
    expect(new AutomationStudioSiteResetLedger().createBaseline(unidentified, undefined)).toEqual({ kind: "admit" });
  });
  it("answers each witness as its stamp, with nothing opaque in it", () => {
    const ledger = boxed();
    expect(ledger.admitStep(declared(NEW_CARD, ["create_new"]))).toEqual({ via: "destination", ref: "destination-1" });
    expect(ledger.admitStep(declared(ROW, ["modify_existing"]))).toEqual({ via: "destination", ref: "destination-1" });
    expect(ledger.admitStep(declared(STAR, ["modify_existing"]))).toBeUndefined();
    ledger.observed({ state: {}, differs: [], resource: SITE, scope: "p:star-page", controls: { "pl:star": { "st:off": 1 } } });
    expect(ledger.admitStep(declared(STAR, ["modify_existing"]))).toEqual({ via: "control", ref: "control-1" });
    expect(ledger.admitStep(declared({ item: "i:loose" }, ["delete"]))).toBeUndefined();
  });

  it("answers a repeat of a witnessed explored act by its id, matched on the step's operation", () => {
    const ledger = boxed();
    ledger.explored(pressed("start-draft", DRAFT, ["create_new"], { resetDestination: "destination-1" }));
    expect(ledger.admitStep(declared(DRAFT, ["create_new"]), "demo.press")).toEqual({ via: "repeats", act: "act-1" });
    expect(ledger.admitStep(declared(DRAFT, ["create_new"]), "demo.other")).toBeUndefined();
  });

  it("answers nothing for a step with no witness, and for one that needs none", () => {
    const ledger = boxed();
    expect(ledger.admitStep(declared(DRAFT, ["modify_existing"]))).toBeUndefined();
    expect(ledger.admitStep(declared(DRAFT, ["create_new"]))).toBeUndefined();
    expect(ledger.admitStep(declared(DRAFT, []))).toBeUndefined();
    expect(ledger.admitStep(declared(DRAFT, ["move_money"]))).toBeUndefined();
    expect(ledger.admitStep({ effect: "observe", consequences: [], control: { name: null, kind: "page" } })).toBeUndefined();
  });
});

describe("a project build's reset refuses a trial with an unwitnessed reversible step (admit)", () => {
  const built = () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = boxed(project.forBrief("brief-1"));
    project.observed(boxPage());
    project.observed({ state: {}, differs: [], resource: SITE, scope: "p:star-page", controls: { "pl:star": { "st:off": 1 } } });
    expect(builder.admitStep(declared(STAR, ["modify_existing"]))).toEqual({ via: "control", ref: "control-1" });
    builder.explored(pressed("start-draft", DRAFT, ["create_new"], { resetDestination: "destination-1" }));
    builder.explored(pressed("pin", { subject: "s:fig", page: "s:fig", resource: SITE }, ["modify_existing"]));
    return { project, reset: automationStudioSiteResetProjectReset({ project, own: builder, checks: () => ({ compare: async () => ({ moved: false, differs: [] }) }) }) };
  };

  it("admits steps whose stamps resolve, and steps that need none", () => {
    const { reset } = built();
    expect(reset.admit?.([
      { step: 1, label: "open the card", consequences: [] },
      { step: 2, label: "pay", consequences: ["move_money"] },
      { step: 3, label: "add the card", consequences: ["create_new"], witness: { via: "destination", ref: "destination-1" } },
      { step: 4, label: "start the draft", consequences: ["create_new"], witness: { via: "repeats", act: "act-1" } },
      { step: 5, label: "star it", consequences: ["modify_existing"], witness: { via: "control", ref: "control-1" } },
      { step: 6, label: "mark the row", consequences: ["modify_existing", "delete"], witness: { via: "destination", ref: "destination-1" } }
    ])).toEqual({ kind: "admit" });
  });

  it("refuses unrun, naming each step whose stamp is missing, malformed or no longer resolves", () => {
    const { reset } = built();
    const decision = reset.admit?.([
      { step: 1, label: "add the card", consequences: ["create_new"], witness: { via: "destination", ref: "destination-1" } },
      { step: 2, label: "mark it", consequences: ["modify_existing"] },
      { step: 3, consequences: ["delete"], witness: { via: "destination", ref: "destination-9" } },
      { step: 4, label: "pin it", consequences: ["modify_existing"], witness: { via: "repeats", act: "act-2" } },
      { step: 5, label: "star it", consequences: ["modify_existing"], witness: { via: "control", place: "pl:star" } }
    ]);
    expect(decision).toEqual({ kind: "refuse", moved: false, evidence: {
      ok: false, code: "candidate.trial_step_unwitnessed", failed: "no_witness", canMeet: "another_page", condition: WORDS.condition("no_witness", "another_page"),
      stepsUnwitnessed: [{ step: 2, label: "mark it" }, { step: 3 }, { step: 4, label: "pin it" }, { step: 5, label: "star it" }],
      instruction: WORDS.stepWitnessRequired([{ ref: "destination-1", count: 2, location: "loc:box" }])
    } });
  });

  it("refuses every reversible step where the caller's port cannot resolve a stamp", () => {
    const { project } = built();
    const narrow = automationStudioSiteResetProjectReset({ project: { snapshot: () => project.snapshot(), forBrief: (brief) => project.forBrief(brief) }, checks: () => ({ compare: async () => ({ moved: false }) }) });
    expect(narrow.admit?.([{ step: 1, consequences: ["create_new"], witness: { via: "destination", ref: "destination-1" } }])).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_step_unwitnessed" } });
  });

  it("a standalone ledger's reset has no admit", () => {
    expect("admit" in new AutomationStudioSiteResetLedger()).toBe(false);
  });
});
