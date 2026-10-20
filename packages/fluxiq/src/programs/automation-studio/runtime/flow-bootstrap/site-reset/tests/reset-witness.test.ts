import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../../executor/index.ts";
import {
  AutomationStudioSiteResetCreateBaselines,
  AutomationStudioSiteResetLedger,
  automationStudioSiteResetSettleWords as settleWords,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetOpenReason,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// Rerun round 2 (job `run-mvgf4pk5-55343613`): a reversible press with no
// witness before the baselines are sealed is refused unrun; settle words never
// ask for a ref none can issue, nor print a withheld place; an invented ref is
// refused before the call runs. Made-up fixtures only: adding a book to a
// reading list, opaque tokens, none of the realistic sites' words.

const SITE = "r:shelf";
const WITHHELD = AUTOMATION_STUDIO_WITHHELD_VALUE;
const readingList = (location = "loc:reading-list"): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:list-page", location, collections: [
  { scope: "p:reading-list", group: "g:reading", subjects: ["s:dune", "s:emma"], states: { "s:dune": "v:dune", "s:emma": "v:emma" } }
] });
const bookPage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:book-page", location: "loc:book" });
/** The "Add to reading list" control on a book's own page: about the book, in no list. */
const ADD: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", scope: "p:book-page", resource: SITE };
/** The same press on a row of the reading list itself. */
const ROW: AutomationStudioSiteResetSpot = { subject: "s:dune", item: "i:dune", scope: "p:reading-list", resource: SITE };
/** A star with a stated state at its place. */
const STAR: AutomationStudioSiteResetSpot = { ...ADD, place: "pl:star", state: "st:off" };
const declared = (control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[] = ["modify_existing"]) => ({ effect: "mutate" as const, consequences, control: { name: "Add to reading list", kind: "button", ...control } });
const pressed = (callId: string, control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, verb: "press", ...declared(control, consequences) }, ...extra });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
const WITNESS = { kind: "refused", evidence: { ok: false, code: "candidate.reset_witness_required" } };
const UNISSUED = { kind: "refused", evidence: { ok: false, code: "candidate.reset_destination_unissued" } };

/** What the permission wrapper does with a press (`../../action-permissions.ts`): asks the precondition first, and only an admitted press runs and reaches the ledger. */
const attempt = (ledger: AutomationStudioSiteResetLedger, callId: string, control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[] = ["modify_existing"], resetDestination?: string) => {
  const verdict = ledger.createBaseline(declared(control, consequences), resetDestination);
  if (verdict.kind === "admit") ledger.explored(pressed(callId, control, consequences, resetDestination === undefined ? {} : { resetDestination }));
  return verdict;
};
const settles = (decision: Awaited<ReturnType<AutomationStudioSiteResetLedger["beforeTrial"]>>): string[] => {
  const acts = decision.kind === "refuse" ? [decision.evidence.actsToUndo, decision.evidence.actsToRestore].flatMap((value) => (Array.isArray(value) ? value : [])) : [];
  return acts.flatMap((entry) => (typeof entry === "object" && entry !== null && !Array.isArray(entry) && typeof entry.settle === "string" ? [entry.settle] : []));
};

describe("a reversible press with no witness before the seal", () => {
  it("is refused unrun, records no act, and the instruction says to observe the list and name its ref", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(bookPage());
    const verdict = attempt(ledger, "add", ADD);
    expect(verdict).toMatchObject(WITNESS);
    const instruction = verdict.kind === "refused" ? String(verdict.evidence.instruction) : "";
    expect(instruction).toContain("observe completely");
    expect(instruction).toContain("resetDestination");
    expect(instruction).toContain("no new permission is needed");
    expect(instruction).not.toMatch(/\b(cart|basket|checkout|job|post|friend|order|product|book|reading)\b/iu);
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.actOf("add")).toBeUndefined();
    // A delete and a mixed reversible press are held to it too.
    expect(attempt(ledger, "remove", rowOutside(), ["delete"])).toMatchObject(WITNESS);
    expect(attempt(ledger, "both", ADD, ["create_new", "modify_existing"])).toMatchObject(WITNESS);
  });

  it("is admitted naming the ref its earlier complete read issued", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList());
    const [receipt] = ledger.destinationReceipts();
    expect(receipt?.ref).toBe("destination-1");
    expect(attempt(ledger, "add", ADD, ["modify_existing"], receipt!.ref)).toEqual({ kind: "admit" });
    expect(ledger.actOf("add")).toBe("act-1");
    // An issued ref of another resource is no witness.
    const fresh = new AutomationStudioSiteResetLedger();
    fresh.observed(readingList());
    fresh.destinationReceipts();
    expect(attempt(fresh, "add", { ...ADD, resource: "r:elsewhere" }, ["modify_existing"], "destination-1")).toMatchObject(WITNESS);
  });

  it("is admitted on a control inside a list recorded complete, and on a stated toggle", () => {
    const listed = new AutomationStudioSiteResetLedger();
    listed.observed(readingList());
    expect(attempt(listed, "row", ROW, ["delete"])).toEqual({ kind: "admit" });
    const starred = new AutomationStudioSiteResetLedger();
    expect(attempt(starred, "star", STAR)).toEqual({ kind: "admit" });
    // A stated state witnesses only a press that declares exactly modify_existing: the toggle witness needs both.
    expect(new AutomationStudioSiteResetLedger().createBaseline(declared(STAR, ["delete"]), undefined)).toMatchObject(WITNESS);
  });

  it("does not seal: a later observation still becomes an original and issues its ref", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    expect(attempt(ledger, "add", ADD)).toMatchObject(WITNESS);
    ledger.observed(readingList());
    expect(ledger.destinationReceipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 2 }]);
    expect(attempt(ledger, "add.retry", ADD, ["modify_existing"], "destination-1")).toEqual({ kind: "admit" });
  });

  it("is admitted as before once the baselines are sealed, and leaves other presses alone", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    expect(attempt(ledger, "star", STAR)).toEqual({ kind: "admit" });
    expect(attempt(ledger, "add", ADD)).toEqual({ kind: "admit" });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1", "act-2"]);
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    const unscoped = { name: null, kind: null };
    for (const other of [
      { effect: "observe" as const, consequences: [], control: unscoped },
      { effect: "mutate" as const, consequences: [], control: { ...unscoped, ...ADD } },
      { effect: "mutate" as const, consequences: ["send_or_publish" as const], control: { ...unscoped, ...ADD } },
      { effect: "mutate" as const, consequences: ["modify_existing" as const, "move_money" as const], control: { ...unscoped, ...ADD } },
      // An unscoped press keeps its legacy policy; a creation keeps the creation precondition's own.
      { effect: "mutate" as const, consequences: ["modify_existing" as const], control: unscoped },
      { effect: "mutate" as const, consequences: ["create_new" as const], control: { ...unscoped, item: "i:new", scope: "p:book-page", resource: SITE } }
    ]) expect(baselines.check(other, undefined)).toEqual({ kind: "admit" });
    expect(baselines.check(declared(ADD, ["create_new"]), undefined)).toMatchObject({ kind: "refused", evidence: { code: "candidate.create_baseline_required" } });
  });
});

describe("an invented resetDestination", () => {
  it("is refused unrun on a press and on a look under undoes; an issued one is admitted", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList());
    ledger.destinationReceipts();
    expect(attempt(ledger, "add.invented", ADD, ["modify_existing"], "destination-7")).toMatchObject(UNISSUED);
    expect(ledger.actOf("add.invented")).toBeUndefined();
    expect(ledger.createBaseline({ effect: "observe", consequences: [], control: { name: null, kind: "page" } }, "destination-7")).toMatchObject(UNISSUED);
    expect(attempt(ledger, "add", ADD, ["modify_existing"], "destination-1")).toEqual({ kind: "admit" });
    const refused = ledger.claim("act-1", "destination-7");
    expect(refused).toMatchObject(UNISSUED);
    const instruction = refused.kind === "refused" ? String(refused.evidence.instruction) : "";
    expect(instruction).toContain("resetDestinations receipt");
    expect(ledger.claim("act-1", 7)).toMatchObject(UNISSUED);
    expect(ledger.claim("act-1", "destination-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    // A creation's precondition is unchanged: an invented ref stays insufficient under its own code.
    expect(ledger.createBaseline(declared(ADD, ["create_new"]), "destination-7")).toMatchObject({ kind: "refused", evidence: { code: "candidate.create_baseline_required" } });
  });

  it("is refused after the seal too, where no ref was ever issued", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    attempt(ledger, "star", STAR);
    expect(attempt(ledger, "add", ADD, ["modify_existing"], "destination-1")).toMatchObject(UNISSUED);
    expect(ledger.claim("act-1", "destination-1")).toMatchObject(UNISSUED);
  });
});

describe("settle words once no ref can be issued", () => {
  it("never instruct naming a resetDestination for a sealed act with no witness and no ref", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(bookPage());
    attempt(ledger, "star", STAR);
    // After the seal a press with no witness is admitted as before, and can never settle.
    attempt(ledger, "add", ADD);
    ledger.observed(bookPage());
    const said = settles(await ledger.beforeTrial(compare)).join(" ");
    expect(said).toContain("cannot be settled in this build");
    expect(said).toContain("trials stay refused while it is in place");
    expect(said).not.toContain("resetDestination");
    expect(said).not.toMatch(/\b(cart|basket|checkout|job|post|friend|order|product|book|reading)\b/iu);
  });

  it("still name the issued refs where some were shown before the seal", () => {
    const said = settleWords([{ reason: "name" }], [{ ref: "destination-1", count: 2, location: "loc:reading-list" }], { closed: true });
    expect(said).toContain("name that list's ref as resetDestination");
    expect(said).toContain("destination-1 (2 items at loc:reading-list)");
  });
});

describe("settle words never print a withheld place", () => {
  it("names no address for a withheld or absent location, in any clause", () => {
    const reasons: AutomationStudioSiteResetOpenReason[] = [
      { reason: "look", witness: "group", ref: "destination-1", location: WITHHELD },
      { reason: "look", witness: "toggle", location: `loc:${WITHHELD}` },
      { reason: "undo", witness: "group", ref: "destination-2", location: WITHHELD },
      { reason: "toggle", witness: "toggle", location: WITHHELD },
      { reason: "name" }
    ];
    for (const closed of [false, true]) for (const issued of [[], [{ ref: "destination-1", count: 1, location: WITHHELD }, { ref: "destination-2", count: 0 }]]) {
      const said = settleWords(reasons, issued, { closed });
      expect(said).not.toContain(WITHHELD);
      expect(said).not.toMatch(/ at [;,).]|at $/u);
    }
    expect(settleWords([{ reason: "look", witness: "group", ref: "destination-1" }], [])).toBe("Read destination-1 completely again.");
  });

  it("through the ledger, for an original read at a withheld place", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList(WITHHELD));
    ledger.destinationReceipts();
    attempt(ledger, "add", ADD, ["modify_existing"], "destination-1");
    attempt(ledger, "add.other", { ...ADD, subject: "s:bronte", page: "s:bronte" });
    const said = settles(await ledger.beforeTrial(compare));
    expect(said.length).toBeGreaterThan(0);
    for (const settle of said) expect(settle).not.toContain(WITHHELD);
  });
});

/** A delete on a control in a list never read complete: no witness. */
function rowOutside(): AutomationStudioSiteResetSpot {
  return { subject: "s:dune", item: "i:dune", scope: "p:unread-list", resource: SITE };
}

// Rerun round 3 (job `run-mvgo9wzn-fad4e050`): by the time a press was refused
// for want of a witness a ref had already been issued, but the refusal said
// only "observe the list". It names the refs already issued, never a withheld place.
describe("a witness refusal once refs are issued", () => {
  it("names each ref already issued with its count and place, and still says to observe a list that has none", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList());
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    ledger.observed(bookPage());
    const verdict = attempt(ledger, "add", ADD);
    expect(verdict).toMatchObject(WITNESS);
    const instruction = verdict.kind === "refused" ? String(verdict.evidence.instruction) : "";
    expect(instruction).toContain("destination-1 (2 items at loc:reading-list)");
    expect(instruction).toContain("observe completely");
    expect(instruction).toContain("no new permission is needed");
  });

  it("never prints a withheld place", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList(`loc:${WITHHELD}`));
    ledger.destinationReceipts();
    const verdict = attempt(ledger, "add", ADD);
    const instruction = verdict.kind === "refused" ? String(verdict.evidence.instruction) : "";
    expect(instruction).toContain("destination-1 (2 items)");
    expect(instruction).not.toContain(WITHHELD);
  });
});
