// The act record's rules, one by one (plan D6): what it refuses, what it never
// refuses, what it remembers of a row, and what survives a fresh record.

import { parseAutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActCall, type AutomationStudioAttemptActRecordData } from "../index.ts";

const WORDS = { what: "Made a thing", where: "On a shop's page" };
const FROZEN = { selector: "#save", element: { tag: "button", text: "Save it" } };

const call = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({
  actionId: "press", parameters: FROZEN, consequences: ["create_new"], stage: "exploration", ...over
});

describe("admission", () => {
  it("runs a call with no act behind it", () => {
    expect(new AutomationStudioAttemptActRecord().admit(call())).toEqual({ kind: "run" });
  });

  it("refuses an identical repeat of a landed act as already done, in every stage", () => {
    const record = new AutomationStudioAttemptActRecord();
    const act = record.settled(call(), { effectApplied: true, words: WORDS })!;
    expect(act.state).toBe("landed");
    for (const stage of ["exploration", "forward", "trial", "run"] as const) expect(record.admit(call({ stage }))).toEqual({ kind: "already_done", act });
  });

  it("refuses a landed act's repeat that declares nothing the second time", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call(), { effectApplied: true, words: WORDS });
    expect(record.admit(call({ consequences: [] })).kind).toBe("already_done");
  });

  it("refuses a may-have-landed repeat until an observation ran, and then lets it try, not blind", () => {
    const record = new AutomationStudioAttemptActRecord();
    const act = record.settled(call(), { effectApplied: false, uncertain: true, words: WORDS })!;
    expect(act.state).toBe("may_have_landed");
    expect(record.admit(call())).toEqual({ kind: "look_first", act });
    record.looked();
    expect(record.admit(call())).toEqual({ kind: "run" });
  });

  it("settles a retry that landed, and holds one that failed to another look", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call(), { effectApplied: false, uncertain: true, words: WORDS });
    record.looked();
    expect(record.settled(call(), { effectApplied: false, words: WORDS })).toBeUndefined();
    expect(record.admit(call()).kind).toBe("look_first");
    record.looked();
    expect(record.settled(call(), { effectApplied: true, words: WORDS })?.state).toBe("landed");
    expect(record.admit(call()).kind).toBe("already_done");
    expect(record.acts()).toHaveLength(1);
  });

  it("records nothing of a declared call that certainly did nothing, and runs it again", () => {
    const record = new AutomationStudioAttemptActRecord();
    expect(record.settled(call(), { effectApplied: false, words: WORDS })).toBeUndefined();
    expect(record.acts()).toEqual([]);
    expect(record.admit(call())).toEqual({ kind: "run" });
  });

  it("tells another target and another action from this act", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call(), { effectApplied: true, words: WORDS });
    expect(record.admit(call({ parameters: { selector: "#other", element: { text: "Other" } } }))).toEqual({ kind: "run" });
    expect(record.admit(call({ actionId: "other" }))).toEqual({ kind: "run" });
  });

  it("knows an act by a handle and by what it froze to, so a repeat in either form is refused", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ parameters: { target: { handle: "t7" } } }), { effectApplied: true, words: WORDS, ranWith: { actionId: "press", parameters: FROZEN } });
    expect(record.admit(call({ parameters: { target: { handle: "t7" } } })).kind).toBe("already_done");
    expect(record.admit(call()).kind).toBe("already_done");
  });
});

describe("an undeclared press", () => {
  it("is never refused, is told to the model, and is left out of the result's acts", () => {
    const record = new AutomationStudioAttemptActRecord();
    const press = call({ consequences: [] });
    expect(record.settled(press, { effectApplied: true, words: WORDS })).toMatchObject({ classes: [], state: "may_have_landed" });
    expect(record.admit(press)).toEqual({ kind: "run" });
    expect(record.admit(call())).toEqual({ kind: "run" });
    expect(record.acts()).toEqual([]);
    expect(record.forModel().acts).toEqual([expect.objectContaining({ undeclared: true, state: "may_have_landed", classes: [] })]);
    expect(record.stepDone(press)).toBe(false);
    expect(record.carried(press)).toBeUndefined();
  });

  it("becomes a declared act when the same press later declares what it does", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ consequences: [] }), { effectApplied: true, words: WORDS });
    record.settled(call(), { effectApplied: true, words: WORDS });
    expect(record.acts()).toEqual([expect.objectContaining({ classes: ["create_new"], state: "landed" })]);
    expect(record.admit(call()).kind).toBe("already_done");
  });

  it("treats an instructed act a call claims as lasting, whatever it declared", () => {
    const record = new AutomationStudioAttemptActRecord();
    const claimed = call({ consequences: [], instructedAct: "part.1" });
    expect(record.settled(claimed, { effectApplied: true, words: WORDS })?.state).toBe("landed");
    expect(record.admit(claimed).kind).toBe("already_done");
  });
});

describe("rows", () => {
  const row = (name: string, extra: JsonObject = {}): JsonObject => ({ name, link: `https://shop.test/p/${name}`, ...extra });
  const scoped = { selector: ".add", element: { text: "Add" } };

  it("takes a row's lasting act as done whatever a read minted, and never another row's", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ parameters: scoped, row: row("oak", { $handle: "read-1" }) }), { effectApplied: true, words: WORDS });
    expect(record.rowDone(row("oak", { $handle: "read-2" }))).toBe(true);
    expect(record.rowDone(row("elm"))).toBe(false);
    expect(record.admit(call({ parameters: scoped, row: row("oak", { $handle: "read-9" }) })).kind).toBe("already_done");
    expect(record.admit(call({ parameters: scoped, row: row("elm") }))).toEqual({ kind: "run" });
  });

  it("gives a by-hand press on a row's printed handle to that row", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([row("oak", { rowHandle: "t21" }), row("elm", { rowHandle: "t22" })]);
    record.settled(call({ parameters: { target: { handle: "t22" } } }), { effectApplied: true, words: WORDS, ranWith: { parameters: scoped } });
    expect(record.rowDone(row("elm"))).toBe(true);
    expect(record.rowDone(row("oak"))).toBe(false);
    // The loop's step on the same row, under another selector: the same act, as the row and the control's words say.
    expect(record.admit(call({ parameters: { selector: "li .add", element: { text: "Add" } }, row: row("elm") })).kind).toBe("already_done");
    // Another control on that row is another act.
    expect(record.admit(call({ parameters: { selector: "li .save", element: { text: "Save for later" } }, row: row("elm") }))).toEqual({ kind: "run" });
  });

  it("gives a by-hand press to the row the answer's sentence names, by the row's own words", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([row("Oak Desk"), row("Elm Desk")]);
    record.settled(call({ parameters: { target: { handle: "t9" } } }), { effectApplied: true, words: WORDS, actedOn: "This acted on item 2/2 (Elm Desk) only, through its \"Add\"; no other item was acted on." });
    expect(record.rowDone(row("Elm Desk"))).toBe(true);
    expect(record.rowDone(row("Oak Desk"))).toBe(false);
  });

  it("marks every row a sentence cannot tell apart, since a row wrongly held not done is an act done twice", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([{ name: "Oak Desk", sku: "1" }, { name: "Oak Desk", sku: "2" }, { name: "Elm Desk", sku: "3" }]);
    record.settled(call({ parameters: { target: { handle: "t9" } } }), { effectApplied: true, words: WORDS, actedOn: "This acted on item 2/3 (Oak Desk) only." });
    expect(record.rowDone({ name: "Oak Desk", sku: "1" })).toBe(true);
    expect(record.rowDone({ name: "Oak Desk", sku: "2" })).toBe(true);
    expect(record.rowDone({ name: "Elm Desk", sku: "3" })).toBe(false);
  });

  it("gives an act on a row's own page to that row, opened by its link", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([row("oak"), row("elm")]);
    record.notePlace({ url: "https://shop.test/p/elm", location: "https://shop.test/p/elm" });
    record.settled(call({ parameters: { target: { handle: "t31" } } }), { effectApplied: true, words: WORDS });
    expect(record.rowDone(row("elm"))).toBe(true);
    expect(record.rowDone(row("oak"))).toBe(false);
  });

  it("stops holding a page's row once the page moves on", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([row("oak"), row("elm")]);
    record.notePlace({ location: "https://shop.test/p/elm" });
    record.notePlace({ location: "https://shop.test/cart" });
    record.settled(call({ parameters: { target: { handle: "t40" } } }), { effectApplied: true, words: WORDS });
    expect(record.rowDone(row("elm"))).toBe(false);
  });

  it("ties an act to a row when the read that lists it comes after", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.notePlace({ location: "https://shop.test/p/elm" });
    record.settled(call({ parameters: { target: { handle: "t31" } } }), { effectApplied: true, words: WORDS });
    record.settled(call({ parameters: { target: { handle: "t32" } }, actionId: "tap" }), { effectApplied: true, words: WORDS, actedOn: "This acted on item 1/2 (Oak Desk) only." });
    expect(record.rowDone(row("elm"))).toBe(false);
    record.noteReadRows([row("elm"), row("Oak Desk")]);
    expect(record.rowDone(row("elm"))).toBe(true);
    expect(record.rowDone(row("Oak Desk"))).toBe(true);
  });

  it("answers a step by its target with no row, and never a per-row call by a row-less act", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ parameters: scoped }), { effectApplied: true, words: WORDS });
    expect(record.stepDone({ actionId: "press", parameters: scoped })).toBe(true);
    expect(record.stepDone({ actionId: "press", parameters: scoped, row: row("oak") })).toBe(false);
    expect(record.admit(call({ parameters: scoped, row: row("oak") }))).toEqual({ kind: "run" });
  });
});

describe("what it says", () => {
  it("returns acts the contract's parser accepts, with a generic line for words it refuses", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call(), { effectApplied: true, words: { what: "<button id=x>Save</button>", where: "https://shop.test/p/1" } });
    record.settled(call({ actionId: "two", consequences: ["move_money", "delete"] }), { effectApplied: true, words: { what: "Bearer abc123", where: "   " } });
    const [first, second] = record.acts();
    // The words were refused, so the control's own word (from its fingerprint) stands before the class's line.
    expect(first).toMatchObject({ what: "Save it", where: "On the site" });
    expect(second).toMatchObject({ what: "Save it", where: "On the site", classes: ["move_money", "delete"] });
    for (const act of record.acts()) expect(parseAutomationStudioAttemptAct(act)).toEqual({ ok: true, act });
  });

  it("keeps a person's words when the parser takes them, and ignores a word that is no class", () => {
    const record = new AutomationStudioAttemptActRecord();
    expect(record.settled(call({ consequences: ["create_new", "none"] }), { effectApplied: true, words: WORDS })).toMatchObject({ ...WORDS, classes: ["create_new"] });
  });

  it("tells a model only screened words, and no key, row or digest", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ parameters: FROZEN, row: { name: "Oak" } }), { effectApplied: true, words: { what: "<b>x</b>", where: "On a page" } });
    const told = JSON.stringify(record.forModel());
    expect(told).not.toContain("<b>");
    expect(told).not.toContain("Oak");
    expect(told).not.toContain("#save");
    expect(told).not.toContain("sha256");
    expect(record.forModel().acts).toEqual([expect.objectContaining({ what: "Made something new", onARow: true })]);
  });

  it("carries no row value or page text in what it persists", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([{ name: "Oak Desk", link: "https://shop.test/p/oak", $handle: "t1" }]);
    record.settled(call({ parameters: { target: { handle: "t9" } } }), { effectApplied: true, words: WORDS, actedOn: "This acted on item 1/1 (Oak Desk) only.", ranWith: { parameters: FROZEN } });
    const persisted = JSON.stringify(record.data());
    for (const secret of ["Oak", "oak", "shop.test", "#save", "Save it"]) expect(persisted).not.toContain(secret);
  });
});

describe("persistence", () => {
  it("writes the whole record one write at a time, in order, and reseeds a fresh record with every rule intact", async () => {
    const written: AutomationStudioAttemptActRecordData[] = [];
    const record = new AutomationStudioAttemptActRecord({
      persist: async (data) => {
        await new Promise((resolve) => setTimeout(resolve, written.length === 0 ? 5 : 0));
        written.push(data);
      },
      now: () => 7
    });
    record.noteReadRows([{ name: "Oak", rowHandle: "t21" }]);
    record.settled(call({ parameters: { target: { handle: "t21" } } }), { effectApplied: true, words: WORDS, ranWith: { parameters: FROZEN } });
    record.settled(call({ actionId: "tap" }), { effectApplied: false, uncertain: true, words: WORDS });
    await record.flushed();
    expect(written.map((data) => data.acts.length)).toEqual([0, 1, 2]);
    expect(written.at(-1)).toEqual(record.data());

    const fresh = new AutomationStudioAttemptActRecord({ seed: JSON.parse(JSON.stringify(written.at(-1))) as AutomationStudioAttemptActRecordData });
    // The same acts, but for the row's words on the line, which stay in this process's memory (`../item-names.ts`).
    expect(record.acts()[0]!.what).toBe("Made a thing: Oak");
    expect(fresh.acts()).toEqual(record.acts().map((act) => ({ ...act, what: "Made a thing" })));
    expect(fresh.admit(call()).kind).toBe("already_done");
    expect(fresh.admit(call({ parameters: { target: { handle: "t21" } } })).kind).toBe("already_done");
    expect(fresh.rowDone({ name: "Oak", rowHandle: "t99" })).toBe(true);
    expect(fresh.admit(call({ actionId: "tap" })).kind).toBe("look_first");
    fresh.looked();
    expect(fresh.admit(call({ actionId: "tap" }))).toEqual({ kind: "run" });
  });

  it("keeps a failed write for flushed, and still writes the next", async () => {
    let writes = 0;
    const record = new AutomationStudioAttemptActRecord({
      persist: async () => {
        writes += 1;
        if (writes === 1) throw new Error("disk full");
      }
    });
    record.settled(call(), { effectApplied: true, words: WORDS });
    record.settled(call({ actionId: "tap" }), { effectApplied: true, words: WORDS });
    await expect(record.flushed()).rejects.toThrow("disk full");
    expect(writes).toBe(2);
  });

  it("reads strictly: an unknown key, an act the contract refuses, a wrong version", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call(), { effectApplied: true, words: WORDS });
    const good = record.data();
    expect(parseAutomationStudioAttemptActRecordData(good)).toEqual({ ok: true, data: good });
    expect(parseAutomationStudioAttemptActRecordData({ ...good, extra: 1 })).toMatchObject({ ok: false, issues: ["act_record.unknown_key"] });
    expect(parseAutomationStudioAttemptActRecordData({ ...good, schemaVersion: 2 })).toMatchObject({ ok: false, issues: ["act_record.invalid_version"] });
    expect(parseAutomationStudioAttemptActRecordData({ ...good, acts: [{ ...good.acts[0]!, what: "<b>x</b>" }] })).toMatchObject({ ok: false });
    expect(parseAutomationStudioAttemptActRecordData({ ...good, acts: [{ ...good.acts[0]!, row: "x" }] })).toMatchObject({ ok: false });
    expect(parseAutomationStudioAttemptActRecordData(null)).toEqual({ ok: false, issues: ["act_record.not_object"] });
    expect(() => new AutomationStudioAttemptActRecord({ seed: { ...good, schemaVersion: 2 } as unknown as AutomationStudioAttemptActRecordData })).toThrow(/seed/u);
  });
});
