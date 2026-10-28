import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../../site-reset/index.ts";
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
} from "../../site-reset/index.ts";

// The exploration door (t751, R3; moved from `site-reset/tests/reset-witness.test.ts`, rerun rounds 2 and 3 and t748):
// the permission wrapper asks the ledger's `createBaseline`, which asks the one admission every time -- not only before
// the first lasting act, as the deleted seal path did. Made-up fixtures only: adding a book to a reading list, opaque
// tokens, none of the realistic sites' words.

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
/** "Copy" on an untitled row of a list never read complete, on a page with a heading: held strictly, by its page. */
const COPY: AutomationStudioSiteResetSpot = { item: "i:untitled", page: "s:shelf-page", scope: "p:unread-list", resource: SITE };
const declared = (control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[] = ["modify_existing"]) => ({ effect: "mutate" as const, consequences, control: { name: "Add to reading list", kind: "button", ...control } });
const pressed = (callId: string, control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored => ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, verb: "press", ...declared(control, consequences) }, ...extra });
const compare = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: false, differs: [] });
// t775: the exploration door no longer refuses a press for want of a witness; it admits it with none.
const WITNESS = { kind: "admit" };
const UNISSUED = { kind: "refused", evidence: { ok: false, code: "candidate.reset_destination_unissued" } };
const REALISTIC = /\b(cart|basket|checkout|job|post|friend|order|product|book|reading)\b/iu;

/** What the permission wrapper does with a press (`../../action-permissions.ts`): asks the door first, and only an admitted press runs and reaches the ledger. */
const attempt = (ledger: AutomationStudioSiteResetLedger, callId: string, control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[] = ["modify_existing"], resetDestination?: string) => {
  const verdict = ledger.createBaseline(declared(control, consequences), resetDestination);
  if (verdict.kind === "admit") ledger.explored(pressed(callId, control, consequences, resetDestination === undefined ? {} : { resetDestination }));
  return verdict;
};
/** What each act still on the site says settles it (t775: the ledger tells it; no trial refusal carries it). */
const settles = (ledger: AutomationStudioSiteResetLedger): string[] => ledger.inPlace().flatMap((act) => (act.settle ? [act.settle] : []));

describe("a reversible press with no witness at the exploration door", () => {
  it("is admitted with no witness (t775): the act is recorded and said as on the site", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(bookPage());
    const verdict = attempt(ledger, "add", ADD);
    expect(verdict).toEqual(WITNESS);
    expect(ledger.actOf("add")).toBe("act-1");
    expect(ledger.standing("act-1")).toBeDefined();
  });

  it("is admitted after an earlier lasting act of the build too", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(bookPage());
    expect(attempt(ledger, "star", STAR)).toEqual({ kind: "admit" });
    expect(ledger.actOf("star")).toBe("act-1");
    expect(attempt(ledger, "add", ADD)).toEqual(WITNESS);
    expect(ledger.actOf("add")).toBe("act-2");
    expect(attempt(ledger, "copy", COPY, ["create_new"])).toEqual(WITNESS);
    // A witnessed press after it is admitted as before.
    expect(attempt(ledger, "star.again", { ...STAR, subject: "s:emma", page: "s:emma", place: "pl:star-2" })).toEqual({ kind: "admit" });
  });

  it("is admitted naming the ref its earlier complete read issued; an issued ref of another resource is no witness", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList());
    const [receipt] = ledger.destinationReceipts();
    expect(receipt?.ref).toBe("destination-1");
    expect(attempt(ledger, "add", ADD, ["modify_existing"], receipt!.ref)).toEqual({ kind: "admit" });
    expect(ledger.actOf("add")).toBe("act-1");
    const fresh = new AutomationStudioSiteResetLedger();
    fresh.observed(readingList());
    fresh.destinationReceipts();
    expect(attempt(fresh, "add", { ...ADD, resource: "r:elsewhere" }, ["modify_existing"], "destination-1")).toMatchObject(WITNESS);
  });

  it("is admitted on a control inside a list recorded complete, and on a stated toggle declaring exactly modify_existing", () => {
    const listed = new AutomationStudioSiteResetLedger();
    listed.observed(readingList());
    expect(attempt(listed, "row", ROW, ["delete"])).toEqual({ kind: "admit" });
    expect(attempt(new AutomationStudioSiteResetLedger(), "star", STAR)).toEqual({ kind: "admit" });
    expect(new AutomationStudioSiteResetLedger().createBaseline(declared(STAR, ["delete"]), undefined)).toMatchObject(WITNESS);
  });

  it("does not seal: a later observation still becomes an original and issues its ref", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    expect(attempt(ledger, "add", ADD)).toMatchObject(WITNESS);
    ledger.observed(readingList());
    expect(ledger.destinationReceipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 2 }]);
    expect(attempt(ledger, "add.retry", ADD, ["modify_existing"], "destination-1")).toEqual({ kind: "admit" });
  });

  it("leaves what is not a reversible scoped press to its own policy", () => {
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    const unscoped = { name: null, kind: null };
    for (const other of [
      { effect: "observe" as const, consequences: [], control: unscoped },
      { effect: "mutate" as const, consequences: [], control: { ...unscoped, ...ADD } },
      { effect: "mutate" as const, consequences: ["send_or_publish" as const], control: { ...unscoped, ...ADD } },
      { effect: "mutate" as const, consequences: ["modify_existing" as const, "move_money" as const], control: { ...unscoped, ...ADD } },
      { effect: "mutate" as const, consequences: ["modify_existing" as const], control: unscoped },
      { effect: "mutate" as const, consequences: ["create_new" as const], control: { ...unscoped, item: "i:new", resource: SITE } }
    ]) expect(baselines.check(other, undefined)).toEqual({ kind: "admit" });
    expect(baselines.check(declared(ADD, ["create_new"]), undefined)).toEqual({ kind: "admit" });
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
    expect(refused.kind === "refused" ? String(refused.evidence.instruction) : "").toContain("resetDestinations receipt");
    expect(ledger.claim("act-1", 7)).toMatchObject(UNISSUED);
    expect(ledger.claim("act-1", "destination-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    // A creation's precondition is unchanged: an invented ref stays insufficient under its own code.
    expect(ledger.createBaseline(declared(ADD, ["create_new"]), "destination-7")).toEqual({ kind: "admit" });
  });

  it("is refused after a lasting act too, where no ref was ever issued", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    attempt(ledger, "star", STAR);
    expect(attempt(ledger, "add", ADD, ["modify_existing"], "destination-1")).toMatchObject(UNISSUED);
    expect(ledger.claim("act-1", "destination-1")).toMatchObject(UNISSUED);
  });
});

// Rerun round 3 (job `run-mvgo9wzn-fad4e050`): the words that ask a step to name where its change shows name the refs already
// issued, never a withheld place (t775: the step door's words; the exploration door no longer refuses).
describe("the words asking a step to name where its change shows, once refs are issued", () => {
  it("name each ref already issued with its count and place", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList());
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    const words = WORDS.stepWitnessRequired(ledger.issuedRefs());
    expect(words).toContain("destination-1 (2 items at loc:reading-list)");
    expect(words).toContain("Name where this step's change shows");
  });

  it("never print a withheld place", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList(`loc:${WITHHELD}`));
    ledger.destinationReceipts();
    const words = WORDS.stepWitnessRequired(ledger.issuedRefs());
    expect(words).toContain("destination-1 (2 items)");
    expect(words).not.toContain(WITHHELD);
  });
});

// t748 (t738's open point): an unidentified creation in an untitled item on a page with a heading is held strictly by the
// ledger, so it is held to the witness rule like any other reversible press.
describe("an unidentified creation (t748)", () => {
  it("is admitted with no witness at the exploration door (t775), and recorded", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(bookPage());
    expect(attempt(ledger, "copy", COPY, ["create_new"])).toEqual(WITNESS);
    expect(ledger.actOf("copy")).toBe("act-1");
  });

  it("is admitted with a witness: an issued ref, or a control inside a list read complete", () => {
    const named = new AutomationStudioSiteResetLedger();
    named.observed(readingList());
    named.destinationReceipts();
    expect(attempt(named, "copy", COPY, ["create_new"], "destination-1")).toEqual({ kind: "admit" });
    expect(named.actOf("copy")).toBe("act-1");
    const listed = new AutomationStudioSiteResetLedger();
    listed.observed(readingList());
    expect(attempt(listed, "copy", { ...COPY, scope: "p:reading-list" }, ["create_new"])).toEqual({ kind: "admit" });
  });

  it("leaves a creation that names nothing on its legacy policy, and an identified one on the creation precondition", () => {
    const baselines = new AutomationStudioSiteResetCreateBaselines();
    expect(baselines.check(declared({ item: "i:untitled", resource: SITE }, ["create_new"]), undefined)).toEqual({ kind: "admit" });
    expect(baselines.check(declared(ADD, ["create_new"]), undefined)).toEqual({ kind: "admit" });
  });
});

// Settle words never print a withheld place (rerun round 2), kept with the door that issues the refs they name. The cases
// that read `closed` (no ref could be issued any more) are superseded by the per-act rule in
// `../../reset-settlement/tests/name-per-act.test.ts` (t751, B). An act with no witness is recorded straight through
// `explored`, as a caller that never asked the door would.
describe("settle words for a list read at a withheld place", () => {
  it("never print a withheld place, in any clause or through the ledger", async () => {
    const reasons: AutomationStudioSiteResetOpenReason[] = [
      { reason: "look", witness: "group", ref: "destination-1", location: WITHHELD },
      { reason: "look", witness: "toggle", location: `loc:${WITHHELD}` },
      { reason: "undo", witness: "group", ref: "destination-2", location: WITHHELD },
      { reason: "toggle", witness: "toggle", location: WITHHELD },
      { reason: "name" }
    ];
    for (const issued of [[], [{ ref: "destination-1", count: 1, location: WITHHELD }, { ref: "destination-2", count: 0 }]]) {
      const words = settleWords(reasons, issued);
      expect(words).not.toContain(WITHHELD);
      expect(words).not.toMatch(/ at [;,).]|at $/u);
    }
    expect(settleWords([{ reason: "look", witness: "group", ref: "destination-1" }], [])).toBe("Read destination-1 completely again.");
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(readingList(WITHHELD));
    ledger.destinationReceipts();
    attempt(ledger, "add", ADD, ["modify_existing"], "destination-1");
    ledger.explored(pressed("add.other", { ...ADD, subject: "s:bronte", page: "s:bronte" }, ["modify_existing"]));
    await ledger.beforeTrial(compare);
    const open = settles(ledger);
    expect(open.length).toBeGreaterThan(0);
    for (const settle of open) expect(settle).not.toContain(WITHHELD);
  });
});
