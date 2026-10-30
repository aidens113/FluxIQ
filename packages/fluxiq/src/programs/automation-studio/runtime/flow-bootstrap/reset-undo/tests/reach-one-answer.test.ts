import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS, AutomationStudioSiteResetLedger, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetSpot, type AutomationStudioSiteResetTarget } from "../../site-reset/index.ts";

// t797 P4 item 3 (rerun round 6 `run-mvrj7qg9-b6dc94f6`, root cause 2; `run-mvrj7qg8-6916b3f7`, question 3): one answer
// never says both that a call can meet its act's condition (`canMeet: this_page` or `another_page`) and that no call can
// settle that act (`actsUnsettleable`, `no_admissible_undo`). Whether an act can still be settled has one source, the
// ledger's own (`../../reset-ledger/answers.ts`, `unsatisfiable`, through `./reach.ts`), and every refusal of an undo of
// that act follows it: where the ledger lists the act apart, the refusal says no call can meet it, and the act is listed
// apart in that answer too, never moved back among the acts to undo. t772 R2 moved it back instead, so the answer read as
// one, but the next answer (the trial's `startedWith`, the ending) listed it apart again, and the builder was sent round the
// same refused press.
//
// Made-up fixtures: a library's reading list and the books on it, opaque tokens only.

const LIB = "r:library";
type Row = [subject: string, state: string];
const ORIGINAL: Row[] = [["s:atlas", "v:unread"], ["s:primer", "v:unread"]];
const readList = (ledger: AutomationStudioSiteResetLedger, rows: Row[]) =>
  ledger.observed({ state: {}, differs: [], resource: LIB, scope: "p:reading-page", location: "loc:reading", collections: [{ scope: "p:reading", group: "g:reading", subjects: rows.map(([subject]) => subject), states: Object.fromEntries(rows) }] });
const row = (subject: string): AutomationStudioSiteResetSpot => ({ scope: "p:reading", subject, item: `i:${subject}`, resource: LIB });
const book = (subject: string): AutomationStudioSiteResetSpot => ({ subject, page: subject, resource: LIB });
const acted = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const ids = (entries: unknown): string[] => (Array.isArray(entries) ? entries.map((entry) => (entry as { act: string }).act) : []);
type Evidence = { act?: string; canMeet?: string; condition?: string; actsToUndo?: unknown; actsUnsettleable?: unknown };
const evidenceOf = (answer: AutomationStudioSiteResetTarget): Evidence | undefined => (answer.kind === "refused" ? (answer.evidence as Evidence) : undefined);

/** A ledger whose one act, `call`, left the reading list as `now`, having named it (`destination-1`) or not. */
function after(consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, now: Row[], named = true): AutomationStudioSiteResetLedger {
  const ledger = new AutomationStudioSiteResetLedger();
  readList(ledger, ORIGINAL);
  // The list's ref is shown, so the act may name it.
  expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
  ledger.explored(acted("act", consequences, spot, named ? { resetDestination: "destination-1" } : {}));
  readList(ledger, now);
  return ledger;
}

/** Ledger states the sweep reads: acts listed apart by the reach, and acts it leaves to undo (guards). */
const STATES: Record<string, () => AutomationStudioSiteResetLedger> = {
  "a row the list held before, changed": () => after(["modify_existing"], book("s:atlas"), [["s:atlas", "v:five-stars"], ["s:primer", "v:unread"]]),
  "a row the list held before, removed": () => after(["delete"], row("s:primer"), [["s:atlas", "v:unread"]], false),
  "two new rows and one act to remove them": () => after(["create_new"], book("s:codex"), [...ORIGINAL, ["s:codex", "v:unread"], ["s:stray", "v:unread"]]),
  "one new row its act can remove (guard)": () => after(["create_new"], book("s:codex"), [...ORIGINAL, ["s:codex", "v:unread"]]),
  "a row changed whose own control is still there (guard)": () => after(["modify_existing"], row("s:atlas"), [["s:atlas", "v:five-stars"], ["s:primer", "v:unread"]])
};

/** Undo calls a builder might make on the list's rows and the books' own pages. */
const CALLS = (["s:atlas", "s:primer", "s:codex", "s:stray"] as const).flatMap((subject) =>
  ([[], ["modify_existing"], ["delete"]] as AutomationStudioActionConsequence[][]).flatMap((consequences) => [aim(consequences, row(subject)), aim(consequences, book(subject))]));

describe("one answer about an act: a call can meet it, or no call can settle it, never both (t797 P4 item 3)", () => {
  it.each(Object.entries(STATES))("%s", (_name, build) => {
    for (const call of CALLS) {
      const ledger = build();
      const apart = ids(ledger.unsatisfiable());
      const evidence = evidenceOf(ledger.target("act-1", call));
      if (!evidence) continue;
      const listed = ids(evidence.actsUnsettleable);
      const meetable = evidence.canMeet === "this_page" || evidence.canMeet === "another_page";
      const where = JSON.stringify(call);
      // Never both in one answer.
      expect(meetable && listed.includes("act-1"), where).toBe(false);
      // And the answer agrees with the ledger's own: listed apart there is listed apart here, met by no call.
      expect(listed.includes("act-1"), where).toBe(apart.includes("act-1"));
      expect(ids(evidence.actsToUndo).includes("act-1") && apart.includes("act-1"), where).toBe(false);
      if (apart.includes("act-1")) expect(evidence.canMeet, where).toBe("no_call");
    }
  });

  it("is not vacuous: an act listed apart is refused with a condition another call on this page would otherwise meet", () => {
    const ledger = STATES["a row the list held before, changed"]!();
    expect(ids(ledger.unsatisfiable())).toEqual(["act-1"]);
    // A press on its book's page declaring nothing lasting: undeclared, which declaring a class would otherwise meet.
    const evidence = evidenceOf(ledger.target("act-1", aim([], book("s:atlas"))));
    expect(evidence).toMatchObject({ act: "act-1", failed: "undeclared_press", canMeet: "no_call", actsToUndo: [], actsUnsettleable: [{ act: "act-1", failed: "no_admissible_undo" }] });
    expect(evidence?.condition).toBe(WORDS.condition("undeclared_press", "no_call"));
    // The ledger still lists it apart, as the answer did.
    expect(ids(ledger.unsatisfiable())).toEqual(["act-1"]);
    expect(ledger.inPlace()).toEqual([]);
  });

  it("leaves an act an undo can still put back to undo, its refusal met on this page (guard)", () => {
    const ledger = STATES["one new row its act can remove (guard)"]!();
    expect(ledger.unsatisfiable()).toEqual([]);
    const evidence = evidenceOf(ledger.target("act-1", aim([], row("s:codex"))));
    expect(evidence).toMatchObject({ act: "act-1", canMeet: "this_page" });
    expect(ids(evidence?.actsToUndo)).toEqual(["act-1"]);
    expect(evidence).not.toHaveProperty("actsUnsettleable");
  });
});
