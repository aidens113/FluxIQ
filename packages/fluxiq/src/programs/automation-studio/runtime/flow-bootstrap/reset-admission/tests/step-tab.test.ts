import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetCreateBaselines,
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../../site-reset/index.ts";
import { automationStudioSiteResetAdmission as admission, automationStudioSiteResetStepReach as stepReach, type AutomationStudioSiteResetStepAsk } from "../index.ts";

// A ref is read in one tab and shows a press's change only for a press in that tab (t791 fix 2): a step's refusal, its
// submission note and its trial note offer the refs read in its own tab and no others, and say `no_call` where no call in
// that tab can make a witness. Made-up fixtures only: a reading shelf in two tabs, opaque tokens.

const TAB_A = "r:tab-a";
const TAB_B = "r:tab-b";
const shelf = (resource: string, scope: string): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource, scope: `${scope}-page`, location: `loc:${scope}`, collections: [
  { scope, group: `g:${scope}`, subjects: ["s:atlas", "s:fable"], states: { "s:atlas": "v:1", "s:fable": "v:1" } }
] });
/** A control about a book, in no list read, in a tab. */
const control = (resource: string | undefined): AutomationStudioSiteResetSpot => ({ subject: "s:novel", item: "i:novel", page: "s:novel", ...(resource !== undefined ? { resource } : {}) });
const declared = (spot: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[] = ["modify_existing"]) => ({ effect: "mutate" as const, consequences, control: { name: "Press", kind: "button", ...spot } });
/** The shelf of tab A read into a ledger and its ref printed (`destination-1`). */
const readInA = (ledger: AutomationStudioSiteResetLedger): AutomationStudioSiteResetLedger => {
  ledger.observed(shelf(TAB_A, "p:shelf-a"));
  ledger.destinationReceipts();
  return ledger;
};

describe("the refs a step is offered", () => {
  it("lists only the refs read in a resource, none for an unknown one", () => {
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    baselines.observed(shelf(TAB_A, "p:shelf-a"));
    baselines.receipts();
    baselines.observed(shelf(TAB_B, "p:shelf-b"));
    baselines.receipts();
    expect(baselines.issuedRefs().map((entry) => entry.ref)).toEqual(["destination-1", "destination-2"]);
    expect(baselines.issuedRefsIn(TAB_A).map((entry) => entry.ref)).toEqual(["destination-1"]);
    expect(baselines.issuedRefsIn(TAB_B).map((entry) => entry.ref)).toEqual(["destination-2"]);
    expect(baselines.issuedRefsIn("r:tab-c")).toEqual([]);
    expect(baselines.issuedRefsIn(undefined)).toEqual([]);
  });

  it("never offers a ref read in another tab in the step door's refusal", () => {
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    baselines.observed(shelf(TAB_A, "p:shelf-a"));
    baselines.receipts();
    const ask = (resource: string) => admission({ declared: declared(control(resource)), door: "step" }, { ...baselines.known(), explored: () => [] });
    const other = ask(TAB_B);
    expect(other).toMatchObject({ kind: "refused", evidence: { code: "candidate.reset_witness_required", canMeet: "another_page" } });
    const said = (other as { evidence: { instruction: string } }).evidence.instruction;
    expect(said).not.toContain("destination-1");
    expect(said).toContain("No ref has been read in this step's tab yet");
    expect((ask(TAB_A) as { evidence: { instruction: string } }).evidence.instruction).toContain("destination-1");
  });
});

describe("whether any call in the step's tab can make a witness", () => {
  it("is no_call where the control names no tab or nothing to read, or no new ref can be issued and its tab holds none", () => {
    const issued = [{ ref: "destination-1", count: 2 }];
    expect(stepReach({ resource: TAB_A, identified: true, issuedHere: [], sealed: false })).toBe("another_page");
    expect(stepReach({ resource: undefined, identified: true, issuedHere: issued, sealed: false })).toBe("no_call");
    expect(stepReach({ resource: TAB_A, identified: false, issuedHere: issued, sealed: false })).toBe("no_call");
    expect(stepReach({ resource: TAB_A, identified: true, issuedHere: [], sealed: true })).toBe("no_call");
    expect(stepReach({ resource: TAB_A, identified: true, issuedHere: issued, sealed: true })).toBe("another_page");
  });

  it("is said by the step door's refusal, with the words that end the hunt", () => {
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    const resourceless = admission({ declared: declared(control(undefined)), door: "step" }, { ...baselines.known(), explored: () => [] });
    expect(resourceless).toMatchObject({ kind: "refused", evidence: { canMeet: "no_call", instruction: WORDS.stepWitnessUnreachable() } });
    baselines.seal();
    expect(admission({ declared: declared(control(TAB_B)), door: "step" }, { ...baselines.known(), explored: () => [] })).toMatchObject({ kind: "refused", evidence: { canMeet: "no_call" } });
    expect(WORDS.stepWitnessUnreachable()).toContain("judged by its end view and each step's done-when check only");
  });
});

describe("a step with no witness is told at submission and before its trial", () => {
  it("fills the ask with the refs of its own tab only, and no_call where none can exist", () => {
    const ledger = readInA(new AutomationStudioSiteResetLedger());
    const same: AutomationStudioSiteResetStepAsk = { ref: "main.s1" };
    expect(ledger.admitStep(declared(control(TAB_A)), "demo.press", same)).toBeUndefined();
    expect(same.gap?.canMeet).toBe("another_page");
    expect(same.gap?.instruction).toContain("destination-1");
    const other: AutomationStudioSiteResetStepAsk = { ref: "main.s2" };
    ledger.admitStep(declared(control(TAB_B)), "demo.press", other);
    expect(other.gap?.canMeet).toBe("another_page");
    expect(other.gap?.instruction).not.toContain("destination-1");
    const none: AutomationStudioSiteResetStepAsk = { ref: "main.s3" };
    ledger.admitStep(declared(control(undefined)), "demo.press", none);
    expect(none.gap).toEqual({ canMeet: "no_call", instruction: WORDS.stepWitnessUnreachable() });
  });

  it("leaves the ask empty for a step that has a witness", () => {
    const ledger = readInA(new AutomationStudioSiteResetLedger());
    const ask: AutomationStudioSiteResetStepAsk = { ref: "main.s1" };
    const row: AutomationStudioSiteResetSpot = { subject: "s:atlas", item: "i:atlas", scope: "p:shelf-a", resource: TAB_A };
    expect(ledger.admitStep(declared(row, ["delete"]), "demo.press", ask)).toEqual({ via: "destination", ref: "destination-1" });
    expect(ask.gap).toBeUndefined();
  });

  it("notes, per step before its trial, only the refs of that step's own tab, and ends the hunt where no call can witness", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const brief = project.forBrief("builder");
    readInA(brief);
    brief.admitStep(declared(control(TAB_B)), "demo.press", { ref: "main.in-b" });
    brief.admitStep(declared(control(undefined)), "demo.press", { ref: "main.nowhere" });
    const reset = automationStudioSiteResetProjectReset({ project, own: brief, checks: () => ({ compare: async () => ({ moved: false }) }) });
    const steps = [
      { step: 1, label: "mark in b", consequences: ["modify_existing" as const], definitionId: "demo.press", ref: "main.in-b" },
      { step: 2, label: "mark nowhere", consequences: ["modify_existing" as const], definitionId: "demo.press", ref: "main.nowhere" },
      { step: 3, label: "never asked", consequences: ["modify_existing" as const], definitionId: "demo.press", ref: "main.unknown" }
    ];
    const answer = reset.admit?.(steps);
    expect(answer).toMatchObject({ kind: "admit", unwitnessed: { steps: [{ step: 1 }, { step: 2 }, { step: 3 }] } });
    const said = (answer as { unwitnessed: { instruction: string } }).unwitnessed.instruction;
    expect(said).not.toContain("destination-1");
    expect(said).toContain(`For "mark nowhere" (plan step 2): ${WORDS.stepWitnessUnreachable()}`);
    expect(said).toContain("For \"mark in b\" (plan step 1): Name where this step's change shows");
    // The step the step door never saw is offered no ref either: none is known to be read in its tab.
    expect(project.stepReach({ definitionId: "demo.press", ref: "main.unknown" })).toBeUndefined();
  });
});
