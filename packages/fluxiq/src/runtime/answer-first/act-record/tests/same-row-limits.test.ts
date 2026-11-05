// Where the one rule's edges are (`../same-row.ts`): elimination, and what a real row can still
// get wrong. A row wrongly held done is left out and told; a row wrongly held not done is an act
// done twice. A test named "known limit" states today's answer, not the answer anyone wants.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord } from "../record.ts";

const call = (row: JsonObject) => ({ actionId: "domain.press", parameters: {}, consequences: ["modify_existing"], row, stage: "forward" as const });
const WORDS = { what: "Pressed", where: "On a list" };

function pressed(row: JsonObject, record = new AutomationStudioAttemptActRecord()): AutomationStudioAttemptActRecord {
  record.settled(call(row), { effectApplied: true, words: WORDS });
  return record;
}

/** Read `before`, press its first row, read `after`, and say which rows of `after` are done. */
function doneAfter(before: JsonObject[], after: JsonObject[]): boolean[] {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows(before);
  pressed(before[0]!, record);
  record.noteReadRows(after);
  return after.map((row) => record.rowDone(row));
}

const copy = (code: string, title = "Atlas"): JsonObject => ({ title, code });

describe("by elimination", () => {
  it("the press changed the only field telling two rows apart: the one row left over is the row pressed", () => {
    const before = [copy("a1"), copy("b2")];
    const after = [copy("zz"), copy("b2")];
    expect(doneAfter(before, after)).toEqual([true, false]);

    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows(before);
    pressed(before[0]!, record);
    record.noteReadRows(after);
    expect(record.admit(call(after[0]!)).kind).toBe("already_done");
    expect(record.admit(call(after[1]!)).kind).toBe("run");
  });

  it("holds in a later read of other columns too", () => {
    expect(doneAfter([copy("a1"), copy("b2")], [{ name: "Atlas", label: "zz" }, { name: "Atlas", label: "b2" }])).toEqual([true, false]);
  });

  it("holds wherever the row left over sits in the list: never by position", () => {
    expect(doneAfter([copy("a1"), copy("b2")], [copy("b2"), copy("zz")])).toEqual([false, true]);
  });

  it("a new row beside rows all still there is a new row: nothing of the earlier list is left over", () => {
    expect(doneAfter([copy("a1"), copy("b2")], [copy("a1"), copy("b2"), copy("c3")])).toEqual([true, false, false]);
  });

  it("two rows left over in the later list cannot be told apart: neither is pressed, and the row still there is", () => {
    expect(doneAfter([copy("a1"), copy("b2")], [copy("zz"), copy("yy"), copy("b2")])).toEqual([true, true, false]);
  });

  it("two rows left over in the earlier list cannot be told apart: the row left over may be the one pressed, so it is not pressed", () => {
    expect(doneAfter([copy("a1"), copy("b2"), copy("c3")], [copy("zz"), copy("c3")])).toEqual([true, false]);
  });

  it("cannot tell is refused at the gate, not guessed", () => {
    const before = [copy("a1"), copy("b2")];
    const after = [copy("zz"), copy("yy"), copy("b2")];
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows(before);
    pressed(before[0]!, record);
    record.noteReadRows(after);
    expect(after.map((row) => record.admit(call(row)).kind)).toEqual(["already_done", "already_done", "run"]);
  });

  it("rows left over that share no word are two rows", () => {
    expect(doneAfter([{ name: "Ann Lee" }, { name: "Ben Ito" }], [{ name: "Cid Moss" }, { name: "Ben Ito" }])).toEqual([false, false]);
  });

  it("rows left over that share only a bare number or date are two rows", () => {
    expect(doneAfter([{ name: "Ann", due: "2030-01-01" }, { name: "Ben", due: "2030-01-02" }], [{ name: "Cid", due: "2030-01-01" }, { name: "Ben", due: "2030-01-02" }])).toEqual([false, false]);
  });

  it("rows left over that share only a word beside what tells them are two rows: most of the row must be the same", () => {
    const accept = (name: string): JsonObject => ({ name, action: "Accept" });
    expect(doneAfter([accept("Ann Lee"), accept("Ben Ito")], [accept("Cid Moss"), accept("Ben Ito")])).toEqual([false, false]);
  });

  it("known limit, left out: a row no read has shown has no mark of what its list shares, so that word alone ties it, elimination or not", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([copy("a1"), copy("b2")]);
    pressed(copy("a1"), record);
    expect(record.rowDone(copy("zz"))).toBe(true);
  });

  it("known limit, left out: one row gone and a new one come between the reads, when most of their words are the same, reads as the row pressed", () => {
    // The press took the row off the list and a new copy arrived. The counts cannot tell this from the first case. It errs the lesser way: the new copy is left out and told, never pressed twice.
    expect(doneAfter([copy("a1"), copy("b2")], [copy("c3"), copy("b2")])).toEqual([true, false]);
  });

  it("known limit, left out: many rows changed at once are all held, because nothing can say which was pressed", () => {
    // More rows are left out than were pressed, and each is told. A person sees a skipped row; nobody can take back a press.
    expect(doneAfter([copy("a1"), copy("b2"), copy("c3")], [copy("zz"), copy("yy"), copy("c3")])).toEqual([true, true, false]);
  });
});

describe("rows a read showed, one way or the other", () => {
  it("a run's act, and the next read showing it changed: the list decides", () => {
    const record = pressed({ title: "Atlas of Rivers", due: "2030-01-01" });
    const after = [{ title: "Atlas of Rivers", due: "2031-06-30" }, { title: "Clockmaking", due: "2030-01-02" }];
    record.noteReadRows(after);
    expect(after.map((row) => record.rowDone(row))).toEqual([true, false]);
  });

  it("a row with an address of its own is told by it, not by the words its read shares with another row", () => {
    const after = [{ name: "Engineer", href: "/jobs/1" }, { name: "Engineer", href: "/jobs/2" }];
    expect(doneAfter([{ title: "Engineer", link: "/jobs/1" }], after)).toEqual([true, false]);
  });
});

describe("long numbers", () => {
  const lamps = [{ title: "Lamp", fee: "1,250,000.00" }, { title: "Desk", fee: "1,250,000.00" }];

  it("an amount written as an amount ties nothing", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows(lamps);
    pressed(lamps[0]!, record);
    expect(record.rowDone({ cost: "1,250,000.00" })).toBe(false);
  });

  it("known limit, left out: the same amount as a bare number reads as an id, and ties", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows(lamps);
    pressed(lamps[0]!, record);
    expect(record.rowDone({ cost: 1250000 })).toBe(true);
  });
});

describe("rows no read has shown", () => {
  it("known limit, pressed twice: a field trimmed inside a word is another value, with no list to say otherwise", () => {
    // Only a row an act or a run carried can meet this: any read of either row sends it to the list's best fit, which holds it.
    expect(pressed({ title: "Atlas of Rivers" }).rowDone({ title: "Atlas of R…" })).toBe(false);
  });
});
