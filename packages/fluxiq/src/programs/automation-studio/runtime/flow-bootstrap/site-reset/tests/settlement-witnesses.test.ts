import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  automationStudioSiteResetGroupWitness as groupWitness,
  automationStudioSiteResetSettleDecision as decide,
  automationStudioSiteResetSettleWords as settleWords,
  automationStudioSiteResetToggleWitness as toggle,
  automationStudioSiteResetTrialRepeats as repeats
} from "../index.ts";

// The pure parts of L1's settlement model, each alone: the toggle a press
// made, the trial act that repeats an explored one, a group witness, the
// control tracker, the settle decision and its words.

describe("the toggle a press made at its place", () => {
  it("is one control going from the pressed state to exactly one other, and nothing else", () => {
    expect(toggle({ state: "st:off", before: { "st:off": 1 }, after: { "st:on": 1 } })).toEqual({ from: "st:off", to: "st:on" });
    expect(toggle({ state: "st:off", before: { "st:off": 3, "st:on": 1 }, after: { "st:off": 2, "st:on": 2 } })).toEqual({ from: "st:off", to: "st:on" });
    for (const [before, after] of [
      [{ "st:off": 1 }, { "st:off": 1 }],
      [{ "st:off": 2 }, { "st:on": 2 }],
      [{ "st:off": 1 }, {}],
      [{ "st:off": 1 }, { "st:on": 1, "st:busy": 1 }],
      [{}, { "st:on": 1 }],
      [{ "st:off": 1 }, { "st:on": 1.5 }]
    ] as Array<[Record<string, number>, Record<string, number>]>) expect(toggle({ state: "st:off", before, after })).toBeUndefined();
    expect(toggle({ state: undefined, before: { "st:off": 1 }, after: { "st:on": 1 } })).toBeUndefined();
  });
});

describe("a trial act repeating an explored act", () => {
  const explored = { consequences: ["create_new" as const], operation: "demo.press", spot: { subject: "s:bread", page: "s:bread", resource: "r:site" } };

  it("needs the same classes, the same operation where both say, a positive subject or page, and nothing contradicting", () => {
    expect(repeats({ consequences: ["create_new"], definitionId: "demo.press", spot: { subject: "s:bread", page: "s:bread" } }, explored)).toBe(true);
    expect(repeats({ consequences: ["create_new"], spot: { page: "s:bread" } }, explored)).toBe(true);
    for (const trial of [
      { consequences: ["modify_existing" as const], definitionId: "demo.press", spot: { subject: "s:bread" } },
      { consequences: ["create_new" as const, "modify_existing" as const], spot: { subject: "s:bread" } },
      { consequences: ["create_new" as const], definitionId: "demo.other", spot: { subject: "s:bread" } },
      { consequences: ["create_new" as const], spot: {} },
      { consequences: ["create_new" as const], spot: { subject: "s:bread", page: "s:other" } },
      { consequences: ["create_new" as const], spot: { subject: "s:bread", resource: "r:other" } }
    ]) expect(repeats(trial, explored)).toBe(false);
  });
});

describe("a group witness", () => {
  const collection = (scope: string, subjects: string[], changed: Record<string, string> = {}) => ({ scope, group: "g:box", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, changed[subject] ?? `v:${subject}`])) });
  const seen = () => {
    const observations = new AutomationStudioSiteResetObservations();
    observations.observe({ state: {}, differs: [], location: "loc:box", collections: [collection("p:cards", ["s:soup"]), collection("p:saved", ["s:pie"]), collection("p:recent", ["s:stew"])] }, true, 0, 0);
    return observations;
  };
  const judge = (observations: AutomationStudioSiteResetObservations, clock = 1) => groupWitness({ observations, group: "g:box", scopes: ["p:cards"], subjects: ["s:pie"], sequence: 1, since: 1, clock });

  it("covers the named scopes and every original that held the act's subject, and holds only on a fresh exact read", () => {
    const observations = seen();
    expect(judge(observations)).toEqual({ status: "stale", scopes: ["p:cards", "p:saved"], changed: false });
    observations.observe({ state: {}, differs: [], collections: [collection("p:cards", ["s:soup"]), collection("p:saved", ["s:pie"]), collection("p:recent", ["s:stew", "s:soup"])] }, true, 1, 1);
    // An unrelated list changing does not block.
    expect(judge(observations)).toMatchObject({ status: "holds" });
    // A later lasting call makes that read stale.
    expect(judge(observations, 2)).toMatchObject({ status: "stale", changed: false });
  });

  it.each(["value", "moved", "missing", "malformed"] as const)("never holds when the read is %s", (defect) => {
    const observations = seen();
    const lists = [collection("p:cards", ["s:soup"]), collection("p:saved", ["s:pie"], defect === "value" ? { "s:pie": "v:changed" } : {}), collection("p:recent", ["s:stew"])];
    if (defect === "moved") lists.splice(0, 3, collection("p:cards", ["s:soup", "s:pie"]), collection("p:saved", []), collection("p:recent", ["s:stew"]));
    if (defect === "missing") lists.splice(1, 1);
    if (defect === "malformed") lists[0] = collection("p:cards", ["s:soup", "s:soup"]);
    observations.observe({ state: {}, differs: [], collections: lists }, true, 1, 1);
    expect(judge(observations)).toMatchObject({ status: defect === "missing" || defect === "malformed" ? "incomplete" : "differs" });
  });

  it("is no witness where no named or subject-holding scope was read before the act", () => {
    expect(groupWitness({ observations: seen(), group: "g:box", scopes: ["p:unread"], subjects: ["s:bread"], sequence: 1, since: 1, clock: 1 })).toEqual({ status: "none", scopes: [], changed: false });
  });
});

describe("the control tracker", () => {
  const read = (tracker: AutomationStudioSiteResetControlTracker, scope: string, counts: Record<string, number>, clock: number) => tracker.read({ scope, location: `loc:${scope}`, controls: { "pl:pin": counts } }, clock);
  const PIN = { from: "st:off", to: "st:on" };

  it("holds a toggle only after a later press at its place left it at the build's start, on a fresh read of that page", () => {
    const tracker = new AutomationStudioSiteResetControlTracker();
    read(tracker, "p:card", { "st:off": 1 }, 0);
    const own = tracker.press("pl:pin", 1);
    read(tracker, "p:card", { "st:on": 1 }, 1);
    expect(own).toMatchObject({ page: "p:card", before: { "st:off": 1 }, after: { "st:on": 1 } });
    expect(tracker.standing("pl:pin", PIN, 1, 1)).toEqual({ status: "open", location: "loc:p:card" });
    // Back by itself, with no press: still open.
    read(tracker, "p:card", { "st:off": 1 }, 1);
    expect(tracker.standing("pl:pin", PIN, 1, 1)).toMatchObject({ status: "open" });
    // A press on another page at the same place, read back there.
    read(tracker, "p:item", { "st:on": 1 }, 1);
    tracker.press("pl:pin", 2);
    read(tracker, "p:item", { "st:off": 1 }, 2);
    expect(tracker.standing("pl:pin", PIN, 1, 2)).toEqual({ status: "holds", location: "loc:p:item" });
    expect(tracker.standing("pl:pin", PIN, 1, 3)).toMatchObject({ status: "stale" });
    // A place a later read of the page does not report is empty there.
    tracker.read({ scope: "p:item", location: "loc:p:item", controls: {} }, 3);
    expect(tracker.standing("pl:pin", PIN, 1, 3)).toMatchObject({ status: "open" });
  });

  it("takes a trial step's press as read on both sides", () => {
    const tracker = new AutomationStudioSiteResetControlTracker();
    tracker.landed("p:card", "pl:pin", { "st:off": 1 }, { "st:on": 1 }, 1);
    expect(tracker.standing("pl:pin", PIN, 1, 1)).toMatchObject({ status: "open" });
  });
});

describe("the settle decision and its words", () => {
  const group = (status: "none" | "stale" | "incomplete" | "differs" | "holds", ref = "destination-1") => ({ status, scopes: ["p:cards"], changed: false, ref, location: "loc:box" });

  it("settles only when every witness holds, restored after a change or an undo, unchanged otherwise", () => {
    expect(decide({ groups: [group("holds")], changeSeen: false, undoLanded: false })).toEqual({ kind: "settled", how: "unchanged" });
    expect(decide({ groups: [group("holds")], toggle: { status: "holds" }, changeSeen: true, undoLanded: false })).toEqual({ kind: "settled", how: "restored" });
    expect(decide({ groups: [group("holds")], changeSeen: false, undoLanded: true })).toEqual({ kind: "settled", how: "restored" });
    expect(decide({ groups: [group("none")], changeSeen: false, undoLanded: false })).toEqual({ kind: "open", reasons: [{ reason: "name" }] });
    expect(decide({ groups: [group("holds"), group("stale", "destination-2"), group("incomplete", "destination-3"), group("differs", "destination-4")], toggle: { status: "open", location: "loc:card" }, changeSeen: true, undoLanded: true })).toEqual({ kind: "open", reasons: [
      { reason: "look", witness: "group", ref: "destination-2", location: "loc:box" },
      { reason: "look", witness: "group", ref: "destination-3", location: "loc:box" },
      { reason: "undo", witness: "group", ref: "destination-4", location: "loc:box" },
      { reason: "toggle", witness: "toggle", location: "loc:card" }
    ] });
  });

  it("says each reason once, in generic words naming only this run's refs and locations", () => {
    const said = settleWords([{ reason: "look", witness: "group", ref: "destination-2", location: "loc:box" }, { reason: "look", witness: "group", ref: "destination-2", location: "loc:box" }, { reason: "undo", witness: "group", ref: "destination-4" }, { reason: "toggle", witness: "toggle", location: "loc:card" }, { reason: "look", witness: "toggle" }, { reason: "name" }], [{ ref: "destination-1", count: 1, location: "loc:box" }]);
    expect(said).toBe("Read destination-2 at loc:box completely again; destination-4 still differs from how the build found it: undo this act there, naming it under undoes; its control at loc:card still shows the state this act set: press that same control back once, naming this act under undoes; read the page again so its control's state can be seen; nothing read shows where its effect would be: read the list where it would show completely and name that list's ref as resetDestination on a look that names this act under undoes (lists read complete before the build acted: destination-1 (1 item at loc:box)).");
    expect(said).not.toMatch(/\b(cart|basket|checkout|kettle|job|post|friend|order|product)\b/iu);
    expect(settleWords([], [])).toBe("");
  });
});
