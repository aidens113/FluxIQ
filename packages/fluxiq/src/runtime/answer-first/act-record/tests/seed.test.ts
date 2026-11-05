// What a new attempt starts its act record with (t870, t869's rule; `../seed.ts`): what landed carries
// however the attempt before it ended, across every later attempt, and a row in another shape is still
// that row while a new one is asked. A lending library stands in, unrelated to any realistic scenario.

import { AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActCall } from "../index.ts";

const WORDS = { what: "Renewed a loan", where: "On the loans page" };
const FROZEN = { selector: ".renew", element: { text: "Renew" } };
const call = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "library.press", parameters: FROZEN, consequences: ["modify_existing"], stage: "exploration", ...over });

function held(): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows([{ title: "Old Roads", $handle: "t2" }]);
  record.notePlace({ location: "https://library.test/loans/17" });
  record.settled(call({ actionId: "by.hand", parameters: { target: { handle: "t7" } } }), { effectApplied: true, words: WORDS, ranWith: { actionId: "by.hand", parameters: FROZEN } });
  record.settled(call({ actionId: "maybe" }), { effectApplied: false, uncertain: true, words: WORDS });
  record.settled(call({ actionId: "pressed", consequences: [] }), { effectApplied: true, words: WORDS });
  record.looked();
  return record;
}

/** Three loans renewed, each on its own row, as one attempt reads and presses them. */
const LOANS: JsonObject[] = [
  { title: "Old Roads", member: "Ann Lee", link: "/loans/17" },
  { title: "Atlas of Rivers", member: "Ann Lee", link: "/loans/18" },
  { title: "Salt and Stone", member: "Ann Lee", link: "/loans/19" }
];
const renewRow = (row: JsonObject): AutomationStudioAttemptActCall => call({ actionId: "library.renew", parameters: { control: "Renew" }, row, stage: "run" });

function renewedAll(): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows(LOANS);
  for (const row of LOANS) record.settled(renewRow(row), { effectApplied: true, words: WORDS });
  return record;
}

describe("the seed of a new attempt", () => {
  for (const status of AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES) {
    it(`after an attempt that ended ${status}, keeps what landed and what may have, and the new record refuses both`, () => {
      const seed = automationStudioAttemptActSeed({ data: held().data() })!;
      expect(parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(seed))).ok).toBe(true);
      const record = new AutomationStudioAttemptActRecord({ seed });
      expect(record.admit(call({ actionId: "by.hand" })).kind).toBe("already_done");
      expect(record.admit(call({ actionId: "maybe" })).kind).toBe("look_first");
      expect(record.acts().map((act) => act.state)).toEqual(["landed", "may_have_landed"]);
    });
  }

  it("says a carried act as already done, not as this attempt's change, and only until this attempt does it itself", () => {
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: held().data() })! });
    expect(record.acts().map((act) => act.what)).toEqual(["Already done earlier: Renewed a loan", "May already be done: Renewed a loan"]);
    expect(record.forModel().acts).toEqual(expect.arrayContaining([expect.objectContaining({ carried: true })]));
    // The persisted record keeps the words as they were, so a later seed does not say it twice.
    expect(record.data().acts.map((act) => act.what)).toEqual(["Renewed a loan", "Renewed a loan"]);
    expect(record.admit(call({ actionId: "maybe" })).kind).toBe("look_first");
    record.looked();
    record.settled(call({ actionId: "maybe" }), { effectApplied: true, words: WORDS });
    expect(record.acts().map((act) => act.what)).toEqual(["Already done earlier: Renewed a loan", "Renewed a loan"]);
  });

  it("keeps the rows an act is on, by their values, and no handle of the attempt before", () => {
    const record = new AutomationStudioAttemptActRecord();
    const row = { title: "Old Roads", link: "/loans/17", $handle: "t2" };
    record.settled(call({ row }), { effectApplied: true, words: WORDS });
    const seed = automationStudioAttemptActSeed({ data: record.data() })!;
    expect(seed.rows.every((kept) => kept.handles.length === 0)).toBe(true);
    expect(new AutomationStudioAttemptActRecord({ seed }).rowDone({ book: "Old Roads", href: "https://library.test/loans/17" })).toBe(true);
  });

  it("asks a look of its own, since the one before it looked at a page as it stood then", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call(), { effectApplied: false, uncertain: true, words: WORDS });
    expect(before.admit(call()).kind).toBe("look_first");
    before.looked();
    expect(before.admit(call()).kind).toBe("run");
    const seed = automationStudioAttemptActSeed({ data: before.data() })!;
    expect(new AutomationStudioAttemptActRecord({ seed }).admit(call()).kind).toBe("look_first");
  });

  it("holds no page of the attempt before: a by-hand act of the new one is not tied to a row by it", () => {
    expect(automationStudioAttemptActSeed({ data: held().data() })!.place).toBeUndefined();
  });

  it("drops a handle the act has another form for, since another attempt's handle may be any control", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call({ parameters: { target: { handle: "t7" } } }), { effectApplied: true, words: WORDS, ranWith: { parameters: FROZEN } });
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: before.data() })! });
    expect(record.admit(call({ parameters: { target: { handle: "t7" } } }))).toEqual({ kind: "run" });
    expect(record.admit(call())).toMatchObject({ kind: "already_done" });
  });

  it("keeps a handle where it is all that is known of an act that may have landed: it costs one look", async () => {
    const before = new AutomationStudioAttemptActRecord();
    await before.begun(call({ parameters: { target: { handle: "t7" } } }), WORDS);
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: before.data() })! });
    expect(record.admit(call({ parameters: { target: { handle: "t7" } } })).kind).toBe("look_first");
  });

  it("leaves out what did not stand, and is nothing where that is all there was", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call(), { effectApplied: true, words: WORDS });
    const data = before.data();
    data.acts[0]!.state = "not_done";
    expect(automationStudioAttemptActSeed({ data })).toBeUndefined();
    data.acts[0]!.state = "undone";
    expect(automationStudioAttemptActSeed({ data })).toBeUndefined();
  });

  it("changes nothing it was given", () => {
    const data = held().data();
    const copy = structuredClone(data);
    automationStudioAttemptActSeed({ data });
    expect(data).toEqual(copy);
  });
});

describe("a press that declared nothing, carried into a later attempt", () => {
  it("whose answer said it changed something that stays: held to a look, never pressed blind, and still on no result", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call({ consequences: [] }), { effectApplied: true, words: WORDS, changedState: true });
    // Within its own attempt it is pressed as often as asked: that is the disclosed limit, and a plain press's proof stands.
    expect(before.admit(call({ consequences: [] })).kind).toBe("run");
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: before.data() })! });
    expect(record.admit(call({ consequences: [] })).kind).toBe("look_first");
    expect(record.carried({ actionId: "library.press", parameters: FROZEN })).toMatchObject({ state: "may_have_landed" });
    expect(record.acts()).toEqual([]);
    record.looked();
    expect(record.admit(call({ consequences: [] })).kind).toBe("run");
  });

  it("that changed nothing, or only moved what is in view: not carried, so a Flow presses it as often as it says", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call({ consequences: [] }), { effectApplied: true, words: WORDS });
    expect(automationStudioAttemptActSeed({ data: before.data() })).toBeUndefined();
  });
});

describe("across many attempts", () => {
  it("attempt 1 lands three, attempt 2 lands none, attempt 3 still carries all three", () => {
    const first = renewedAll();
    const second = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.data() })! });
    const third = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: second.data() })! });
    expect(third.acts()).toHaveLength(3);
    for (const row of LOANS) expect(third.carried({ actionId: "library.renew", parameters: { control: "Renew" }, row })).toBeDefined();
  });

  it("a Run again starts empty, and what it was spared and what it landed both carry to the next", () => {
    const first = renewedAll();
    const spared = automationStudioAttemptActSeed({ data: first.data() })!;
    const again = new AutomationStudioAttemptActRecord();
    again.noteReadRows([...LOANS, { title: "The Long Shelf", member: "Ann Lee", link: "/loans/20" }]);
    again.settled(renewRow({ title: "The Long Shelf", member: "Ann Lee", link: "/loans/20" }), { effectApplied: true, words: WORDS });
    const next = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: again.data(), earlier: spared })! });
    expect(next.acts()).toHaveLength(4);
    expect(next.rowDone({ title: "The Long Shelf", member: "Ann Lee" })).toBe(true);
    expect(next.rowDone({ title: "Old Roads", member: "Ann Lee" })).toBe(true);
  });

  it("a Run again that pressed the same row again is one act, not two", () => {
    const first = renewedAll();
    const again = renewedAll();
    const next = automationStudioAttemptActSeed({ data: again.data(), earlier: automationStudioAttemptActSeed({ data: first.data() })! })!;
    expect(next.acts).toHaveLength(3);
  });
});

describe("rows across attempts", () => {
  it("a carried row read again in another shape is still that row, and a new row is asked", () => {
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: renewedAll().data() })! });
    const reshaped: JsonObject[] = [
      { book: "Old Roads", href: "https://library.test/loans/17" },
      { book: "Atlas of Rivers", href: "https://library.test/loans/18" },
      { book: "Salt and Stone", href: "https://library.test/loans/19" },
      { book: "The Long Shelf", href: "https://library.test/loans/20" }
    ];
    record.noteReadRows(reshaped);
    expect(reshaped.map((row) => record.rowDone(row))).toEqual([true, true, true, false]);
    expect(record.carried({ actionId: "library.renew", parameters: { control: "Renew" }, row: reshaped[3]! })).toBeUndefined();
    expect(record.carried({ actionId: "library.renew", parameters: { control: "Renew" }, row: reshaped[0]! })).toBeDefined();
  });

  it("a row the first attempt never pressed is still asked", () => {
    const first = new AutomationStudioAttemptActRecord();
    first.noteReadRows(LOANS);
    first.settled(renewRow(LOANS[0]!), { effectApplied: true, words: WORDS });
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.data() })! });
    expect(LOANS.map((row) => record.rowDone(row))).toEqual([true, false, false]);
  });
});
