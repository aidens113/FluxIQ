import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";
import type { AutomationStudioSiteResetCanMeet, AutomationStudioSiteResetFailed } from "../../reset-answers/index.ts";

// t743 (rerun round 4, job `run-mvgw1854-5d10955b`, photo `run-mvgw7320-de416190`):
// every refused undo names the one condition that failed, read off the code
// path that refused it, and whether any call can meet it. Made-up fixtures:
// a document list and an archive, opaque tokens only. Which condition is named
// never changes what is admitted, and the act stays listed as before.

type Unmet = { code: string; failed: AutomationStudioSiteResetFailed; canMeet: AutomationStudioSiteResetCanMeet };

const acted = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot = {}, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Press", kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot = {}) => ({ effect: "mutate" as const, consequences, control });
/** The refusal names `failed` and `canMeet`, says them in words, and leaves the act listed. */
const refusedFor = (ledger: AutomationStudioSiteResetLedger, act: string, target: ReturnType<typeof aim>, unmet: Unmet): JsonObject => {
  const listed = ledger.inPlace().map((entry) => entry.act);
  const answer = ledger.target(act, target);
  expect(answer).toMatchObject({ kind: "refused", evidence: { ok: false, code: unmet.code, act, failed: unmet.failed, canMeet: unmet.canMeet, condition: WORDS.condition(unmet.failed, unmet.canMeet) } });
  expect(ledger.inPlace().map((entry) => entry.act)).toEqual(listed);
  return answer.kind === "refused" ? answer.evidence : {};
};
const UNPROVED = "candidate.undo_unproved";

describe("a subject deletion names the condition it failed", () => {
  const LIST = { scope: "p:documents", subject: "s:document" };
  const observe = (ledger: AutomationStudioSiteResetLedger, subjects: string[]) => ledger.observed({ state: {}, location: "loc:documents", differs: [], scope: LIST.scope, subjects, collections: [{ scope: LIST.scope, group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) }] });
  const made = (before: string[] | undefined, after: string[], consequences: AutomationStudioActionConsequence[] = ["create_new"]) => {
    const ledger = new AutomationStudioSiteResetLedger();
    if (before) observe(ledger, before);
    ledger.explored(acted("make", consequences, { subject: "s:document", page: "s:document" }));
    observe(ledger, after);
    return ledger;
  };

  it("still admits the one exact inverse", () => {
    expect(made(["s:baseline"], ["s:baseline", "s:document"]).target("act-1", aim(["delete"], LIST))).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
  });

  it("a control about another item: subject_differs, met only elsewhere (job r4)", () => {
    const evidence = refusedFor(made(["s:baseline"], ["s:baseline", "s:document"]), "act-1", aim(["delete"], { ...LIST, subject: "s:other" }), { code: UNPROVED, failed: "subject_differs", canMeet: "another_page" });
    expect(evidence).toMatchObject({ instruction: WORDS.unprovedUndo(false) });
    expect(String(evidence.instruction)).not.toContain("Inspect what this build created");
  });

  it("a control that names no item: no_item_identity", () => {
    refusedFor(made(["s:baseline"], ["s:baseline", "s:document"]), "act-1", aim(["delete"], { scope: LIST.scope }), { code: UNPROVED, failed: "no_item_identity", canMeet: "this_page" });
  });

  it("classes that do not reverse the act's: consequence_not_inverse, met by another call here", () => {
    const ledger = made(["s:baseline"], ["s:baseline", "s:document"]);
    refusedFor(ledger, "act-1", aim(["create_new"], LIST), { code: UNPROVED, failed: "consequence_not_inverse", canMeet: "this_page" });
    refusedFor(ledger, "act-1", aim(["modify_existing"], LIST), { code: UNPROVED, failed: "consequence_not_inverse", canMeet: "this_page" });
  });

  it("no complete read of the list before the act: no_destination_read_before, met by no call", () => {
    refusedFor(made(undefined, ["s:baseline", "s:document"]), "act-1", aim(["delete"], LIST), { code: UNPROVED, failed: "no_destination_read_before", canMeet: "no_call" });
  });

  it("the list not read completely now: destination_not_read_now", () => {
    const ledger = made(["s:baseline"], ["s:baseline", "s:document"]);
    ledger.observed({ state: {}, differs: [], collections: [{ scope: "p:sibling", group: "g:page", subjects: ["s:spare"], states: { "s:spare": "v:spare" } }] });
    refusedFor(ledger, "act-1", aim(["delete"], LIST), { code: UNPROVED, failed: "destination_not_read_now", canMeet: "this_page" });
  });

  it("the item there before the act: subject_there_before; gone now: subject_not_present_now", () => {
    refusedFor(made(["s:document"], ["s:document"]), "act-1", aim(["delete"], LIST), { code: UNPROVED, failed: "subject_there_before", canMeet: "no_call" });
    refusedFor(made(["s:baseline"], ["s:baseline"]), "act-1", aim(["delete"], LIST), { code: UNPROVED, failed: "subject_not_present_now", canMeet: "no_call" });
  });

  it("a change to something that existed has no exact inverse here: no_exact_inverse", () => {
    refusedFor(made(["s:baseline"], ["s:baseline", "s:document"], ["modify_existing"]), "act-1", aim(["modify_existing"], LIST), { code: UNPROVED, failed: "no_exact_inverse", canMeet: "no_call" });
  });

  it("an identified control declaring nothing lasting: undeclared_press", () => {
    refusedFor(made(["s:baseline"], ["s:baseline", "s:document"]), "act-1", aim([], LIST), { code: UNPROVED, failed: "undeclared_press", canMeet: "this_page" });
  });
});

describe("a transfer names the condition it failed", () => {
  const origin = { scope: "p:active", subject: "s:document", item: "i:document" };
  const archive = { scope: "p:archive", subject: "s:document", item: "i:stored-document" };
  type List = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
  const list = (scope: string, subjects: string[], changed: Record<string, string> = {}): List => ({ scope, group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, changed[subject] ?? `v:${subject}`])) });
  const before = () => [list(origin.scope, ["s:document", "s:baseline"]), list(archive.scope, ["s:archived"])];
  const after = () => [list(origin.scope, ["s:baseline"]), list(archive.scope, ["s:document", "s:archived"], { "s:document": "v:stored" })];
  const observed = (ledger: AutomationStudioSiteResetLedger, collections: List[]) => ledger.observed({ state: {}, location: "loc:collections", differs: [], collections });
  const moved = () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observed(ledger, before());
    ledger.explored(acted("move", ["modify_existing"], origin));
    ledger.placed("act-1", { state: {}, location: "loc:collections", changed: ["moved"], collections: { before: before(), after: after() } });
    observed(ledger, after());
    return ledger;
  };

  it("still admits the witnessed move back", () => {
    expect(moved().target("act-1", aim(["modify_existing"], archive))).toEqual({ kind: "admit", on: "subject", allowed: ["modify_existing"] });
  });

  it("names each failed transfer condition", () => {
    refusedFor(moved(), "act-1", aim(["delete"], archive), { code: UNPROVED, failed: "consequence_not_inverse", canMeet: "this_page" });
    refusedFor(moved(), "act-1", aim(["modify_existing"], { ...archive, subject: "s:other" }), { code: UNPROVED, failed: "subject_differs", canMeet: "another_page" });
    const unread = moved();
    observed(unread, [list(archive.scope, ["s:document", "s:archived"], { "s:document": "v:stored" })]);
    refusedFor(unread, "act-1", aim(["modify_existing"], archive), { code: UNPROVED, failed: "destination_not_read_now", canMeet: "this_page" });
    const gone = moved();
    observed(gone, [list(origin.scope, ["s:baseline"]), list(archive.scope, ["s:archived"])]);
    refusedFor(gone, "act-1", aim(["modify_existing"], archive), { code: UNPROVED, failed: "subject_not_present_now", canMeet: "no_call" });
    const changed = moved();
    observed(changed, [list(origin.scope, ["s:baseline"]), list(archive.scope, ["s:document", "s:archived"], { "s:document": "v:other" })]);
    refusedFor(changed, "act-1", aim(["modify_existing"], archive), { code: UNPROVED, failed: "transfer_not_witnessed", canMeet: "no_call" });
  });
});

describe("its own toggle's place (photo r4 0151)", () => {
  const SITE = "r:site";
  const page = (state: string): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: SITE, scope: "p:item", location: "loc:item", controls: { "pl:mark": { [state]: 1 } } });
  const MARK: AutomationStudioSiteResetSpot = { scope: "p:item", subject: "s:item", resource: SITE, place: "pl:mark", state: "st:off" };
  const toggled = () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed(page("st:off"));
    ledger.explored(acted("mark", ["modify_existing"], MARK));
    ledger.observed(page("st:on"));
    return ledger;
  };

  it("still admits a press back while its control shows the state the act set", () => {
    expect(toggled().target("act-1", aim([], { ...MARK, state: "st:on" }))).toEqual({ kind: "admit", on: "own", allowed: ["modify_existing"] });
  });

  it("already showing the state the build found: undo_already_back, no call, with the act's remaining settle", () => {
    const ledger = toggled();
    const listed = ledger.inPlace();
    for (const consequences of [[], ["modify_existing"], ["delete"]] as AutomationStudioActionConsequence[][]) {
      const evidence = refusedFor(ledger, "act-1", aim(consequences, { ...MARK, state: "st:off" }), { code: "candidate.undo_already_back", failed: "already_back", canMeet: "no_call" });
      expect(evidence).toMatchObject({ instruction: WORDS.alreadyBack(), actsToUndo: listed });
      expect(evidence.settle).toBe(listed[0]!.settle);
      expect(evidence.settle).toEqual(expect.any(String));
    }
  });

  it("neither state: control_state_differs; another class while showing the act's state: consequence_not_inverse", () => {
    // Its last open condition, met by no call: the refusal itself lists the act apart (t748, `../undo-reach.ts`).
    const third = toggled();
    expect(third.target("act-1", aim([], { ...MARK, state: "st:third" }))).toMatchObject({ kind: "refused", evidence: { code: UNPROVED, act: "act-1", failed: "control_state_differs", canMeet: "no_call", condition: WORDS.condition("control_state_differs", "no_call"), actsToUndo: [], actsUnsettleable: [{ act: "act-1", failed: "no_admissible_undo" }] } });
    refusedFor(toggled(), "act-1", aim(["delete"], { ...MARK, state: "st:on" }), { code: UNPROVED, failed: "consequence_not_inverse", canMeet: "this_page" });
  });

  it("a control at another place: control_elsewhere", () => {
    refusedFor(toggled(), "act-1", aim([], { ...MARK, place: "pl:other", state: "st:x" }), { code: UNPROVED, failed: "control_elsewhere", canMeet: "another_page" });
    refusedFor(toggled(), "act-1", aim(["modify_existing"], { ...MARK, subject: "s:another", place: "pl:other", state: "st:x" }), { code: UNPROVED, failed: "control_elsewhere", canMeet: "another_page" });
  });
});

describe("a legacy act's wrong target", () => {
  it("names not_own_item, met by no call, and keeps the act as before", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("add", ["create_new"], { item: "i:one" }));
    const answer = ledger.target("act-1", aim(["delete"], { item: "i:two" }));
    expect(answer).toMatchObject({ kind: "refused", evidence: { ok: false, code: "candidate.undo_wrong_target", act: "act-1", failed: "not_own_item", canMeet: "no_call", condition: WORDS.condition("not_own_item", "no_call"), instruction: WORDS.wrongTarget(), cannotUndo: [{ act: "act-1" }] } });
  });
});

describe("a removal on a destination the act named (t743, job e1)", () => {
  // A library: a book kept from its own page, naming the reading list read
  // complete before it (2 rows). The domain names the book differently on its
  // page and as the list's new row, so no undo about the act's own subject fits.
  const SITE = "r:library";
  const BOOK: AutomationStudioSiteResetSpot = { subject: "s:book-page", page: "s:book-page", resource: SITE };
  const NEW_ROW: AutomationStudioSiteResetSpot = { scope: "p:reading", subject: "s:book-row", item: "i:book-row", resource: SITE };
  const HELD_ROW: AutomationStudioSiteResetSpot = { scope: "p:reading", subject: "s:atlas", item: "i:atlas", resource: SITE };
  const readList = (ledger: AutomationStudioSiteResetLedger, subjects: string[], scope = "p:reading", group = "g:reading") =>
    ledger.observed({ state: {}, differs: [], resource: SITE, scope: `${scope}-page`, location: `loc:${scope}`, collections: [{ scope, group, subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) }] });
  const ORIGINAL = ["s:atlas", "s:primer"];
  const NOW = [...ORIGINAL, "s:book-row"];
  const kept = (consequences: AutomationStudioActionConsequence[] = ["modify_existing"]) => {
    const ledger = new AutomationStudioSiteResetLedger();
    readList(ledger, ORIGINAL);
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    readList(ledger, ["s:shelved"], "p:wishlist", "g:wishlist");
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-2"]);
    ledger.explored(acted("keep", consequences, BOOK, { resetDestination: "destination-1" }));
    readList(ledger, NOW);
    return ledger;
  };
  const compare = async () => ({ moved: false, differs: [] });

  for (const declared of [["delete"], ["modify_existing"]] as AutomationStudioActionConsequence[][]) {
    it(`admits removing the new row (${declared[0]}) once, unasked, and settles the act on the list's 2 original rows`, async () => {
      const ledger = kept();
      expect(ledger.target("act-1", aim(declared, NEW_ROW))).toEqual({ kind: "admit", on: "subject", allowed: declared });
      ledger.explored(acted("remove", declared, NEW_ROW, { undoes: "act-1", on: "subject" }));
      // A second unasked removal: refused before it runs, and by the admission too.
      expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_done", failed: "undo_spent" } });
      refusedFor(ledger, "act-1", aim(declared, NEW_ROW), { code: UNPROVED, failed: "undo_spent", canMeet: "no_call" });
      readList(ledger, ORIGINAL);
      expect(ledger.standing("act-1")).toBe("restored");
      expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
    });
  }

  it("an act that created admits the same removal", () => {
    expect(kept(["create_new"]).target("act-1", aim(["modify_existing"], NEW_ROW))).toEqual({ kind: "admit", on: "subject", allowed: ["modify_existing"] });
  });

  it("a row the list held before the build: subject_there_before, met by no call", () => {
    refusedFor(kept(), "act-1", aim(["modify_existing"], HELD_ROW), { code: UNPROVED, failed: "subject_there_before", canMeet: "no_call" });
    refusedFor(kept(), "act-1", aim(["delete"], HELD_ROW), { code: UNPROVED, failed: "subject_there_before", canMeet: "no_call" });
  });

  it("a list the act never named keeps its condition, even with a row new there", () => {
    const ledger = kept();
    readList(ledger, ["s:shelved", "s:book-row"], "p:wishlist", "g:wishlist");
    refusedFor(ledger, "act-1", aim(["delete"], { ...NEW_ROW, scope: "p:wishlist" }), { code: UNPROVED, failed: "subject_differs", canMeet: "another_page" });
  });

  it("names each other failed condition on the named list", () => {
    refusedFor(kept(), "act-1", aim(["create_new"], NEW_ROW), { code: UNPROVED, failed: "consequence_not_inverse", canMeet: "this_page" });
    refusedFor(kept(), "act-1", aim(["delete"], { scope: "p:reading", item: "i:book-row", resource: SITE }), { code: UNPROVED, failed: "no_item_identity", canMeet: "this_page" });
    refusedFor(kept(), "act-1", aim(["delete"], { ...NEW_ROW, subject: "s:never-listed" }), { code: UNPROVED, failed: "subject_not_present_now", canMeet: "no_call" });
    const stale = kept();
    readList(stale, ["s:shelved"], "p:wishlist", "g:wishlist");
    readList(stale, ["s:other"], "p:sibling", "g:reading");
    refusedFor(stale, "act-1", aim(["delete"], NEW_ROW), { code: UNPROVED, failed: "destination_not_read_now", canMeet: "this_page" });
  });

  it("a trial act repeating the explored act removes on the destination it lends", () => {
    const ledger = kept();
    ledger.explored(acted("remove", ["delete"], NEW_ROW, { undoes: "act-1", on: "subject" }));
    readList(ledger, ORIGINAL);
    expect(ledger.standing("act-1")).toBe("restored");
    ledger.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["modify_existing"], spot: BOOK }], "trial.1");
    readList(ledger, NOW);
    expect(ledger.target("act-2", aim(["delete"], NEW_ROW))).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
  });
});
