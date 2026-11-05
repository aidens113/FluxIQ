// One row, read differently (`../same-row.ts`, t869): the row an act was on is known again under
// another read's columns, and a different row is not taken for it, except where the bias says so.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { parseAutomationStudioAttemptActRecordData } from "../record-data.ts";
import { AutomationStudioAttemptActRecord } from "../record.ts";

const PRESS = "domain.press";
const WORDS = { what: "Accepted", where: "On a list" };

/** A record whose first read noted `read`, with `done` acted on by its own row's name. */
function pressedByHand(read: JsonObject[], actedOn: string): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows(read);
  record.settled({ actionId: PRESS, parameters: { target: { handle: "t9" } }, consequences: ["modify_existing"], stage: "exploration" }, { effectApplied: true, words: WORDS, actedOn: `This acted on ${actedOn} only; no other item was acted on.` });
  return record;
}

const PEOPLE: JsonObject[] = [
  { name: "Ximena Ruiz", message: "Happy to swap notes on the market", state: "Waiting" },
  { name: "Lucia Romano", message: "Loved your post on interviews", state: "Waiting" },
  { name: "Chidi Nwosu", message: "Priya suggested I reach out", state: "Waiting" }
];

describe("the same row under another read", () => {
  it.each<[string, (row: JsonObject) => JsonObject]>([
    ["renamed columns", (row) => ({ person: row.name!, note: row.message! })],
    ["fewer columns", (row) => ({ name: row.name! })],
    ["a field the read had not", (row) => ({ ...row, headline: "Data engineer at Kade" })],
    ["a derived field", (row) => ({ label: `${String(row.name)}: ${String(row.message)}` })],
    ["a different case and spacing", (row) => ({ name: `  ${String(row.name).toUpperCase()} ` })]
  ])("%s: the row pressed is done and the others are not", (_name, shape) => {
    const record = pressedByHand(PEOPLE, "Ximena Ruiz, Happy to swap notes on the market");
    const flow = PEOPLE.map(shape);
    record.noteReadRows(flow);
    expect(flow.map((row) => record.rowDone(row))).toEqual([true, false, false]);
  });

  it("a row the press changed is still that row, and a status every row shares ties nobody to it", () => {
    const record = pressedByHand(PEOPLE, "Ximena Ruiz, Happy to swap notes on the market");
    const after = [{ ...PEOPLE[0]!, state: "Accepted" }, PEOPLE[1]!, PEOPLE[2]!];
    record.noteReadRows(after);
    expect(after.map((row) => record.rowDone(row))).toEqual([true, false, false]);
  });

  it("a row read before any list named it, and a read of one row, tie nobody by a word every row of the later read holds", () => {
    const record = pressedByHand([{ name: "Ximena Ruiz", state: "Waiting" }], "Ximena Ruiz");
    const later = [{ person: "Ximena Ruiz", state: "Waiting" }, { person: "Lucia Romano", state: "Waiting" }];
    record.noteReadRows(later);
    expect(later.map((row) => record.rowDone(row))).toEqual([true, false]);
  });

  it("two rows of one read are never one row, however much they share", () => {
    const record = new AutomationStudioAttemptActRecord();
    const rows = [{ title: "Atlas of Rivers", copy: "2030-01-01" }, { title: "Atlas of Rivers", copy: "2030-01-02" }];
    record.noteReadRows(rows);
    record.settled({ actionId: PRESS, parameters: { title: "Atlas of Rivers" }, consequences: ["modify_existing"], row: rows[0]!, stage: "forward" }, { effectApplied: true, words: WORDS });
    record.noteReadRows(rows);
    expect(rows.map((row) => record.rowDone(row))).toEqual([true, false]);
    expect(record.admit({ actionId: PRESS, parameters: { title: "Atlas of Rivers" }, consequences: ["modify_existing"], row: rows[1]!, stage: "forward" }).kind).toBe("run");
    expect(record.admit({ actionId: PRESS, parameters: { title: "Atlas of Rivers" }, consequences: ["modify_existing"], row: rows[0]!, stage: "forward" }).kind).toBe("already_done");
  });

  it("two different rows that share words: the one that fits best is the row, and the other stays to do", () => {
    const rows = [{ title: "Birds of the Coast" }, { title: "Birds of the Marsh" }];
    const record = pressedByHand(rows.map((row, at) => ({ ...row, due: `2030-01-0${at + 1}` })), "Birds of the Coast");
    record.noteReadRows(rows);
    expect(rows.map((row) => record.rowDone(row))).toEqual([true, false]);
  });

  it("a read that dropped what told two rows apart holds both done: left out and told, never pressed twice", () => {
    const record = new AutomationStudioAttemptActRecord();
    const read = [{ title: "Atlas of Rivers", copy: "2030-01-01" }, { title: "Atlas of Rivers", copy: "2030-01-02" }, { title: "Clockmaking", copy: "2030-01-03" }];
    record.noteReadRows(read);
    record.settled({ actionId: PRESS, parameters: { title: "Atlas of Rivers" }, consequences: ["modify_existing"], row: read[0]!, stage: "forward" }, { effectApplied: true, words: WORDS });
    const flow = [{ title: "Atlas of Rivers" }, { title: "Atlas of Rivers" }, { title: "Clockmaking" }];
    record.noteReadRows(flow);
    expect(flow.map((row) => record.rowDone(row))).toEqual([true, true, false]);
  });

  it("a shared address is the row, whatever else was renamed; one every row holds is not", () => {
    const read = [{ name: "Ann Lee", link: "/people/ann", list: "/requests" }, { name: "Ben Ito", link: "/people/ben", list: "/requests" }];
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows(read);
    record.settled({ actionId: PRESS, parameters: { title: "x" }, consequences: ["modify_existing"], row: read[0]!, stage: "forward" }, { effectApplied: true, words: WORDS });
    const flow = [{ profile: "https://site.test/people/ann", list: "/requests" }, { profile: "https://site.test/people/ben", list: "/requests" }];
    record.noteReadRows(flow);
    expect(flow.map((row) => record.rowDone(row))).toEqual([true, false]);
  });

  it("a row of nothing but numbers ties nothing by a small number, and does by an id", () => {
    const record = new AutomationStudioAttemptActRecord();
    const read = [{ name: "Ann Lee", friends: 5, id: "1055628457" }, { name: "Ben Ito", friends: 7, id: "1055628458" }];
    record.noteReadRows(read);
    record.settled({ actionId: PRESS, parameters: { title: "x" }, consequences: ["modify_existing"], row: read[0]!, stage: "forward" }, { effectApplied: true, words: WORDS });
    expect(record.rowDone({ count: 5 })).toBe(false);
    expect(record.rowDone({ ref: "1055628457" })).toBe(true);
    expect(record.rowDone({ ref: "1055628458" })).toBe(false);
  });

  it("an act on a reshaped row keeps its own id and row, and a later read of the first shape knows it", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows(PEOPLE);
    const flow = PEOPLE.map((row) => ({ person: row.name!, note: row.message! }));
    record.noteReadRows(flow);
    const first = record.settled({ actionId: PRESS, parameters: {}, consequences: ["modify_existing"], row: flow[0]!, stage: "forward" }, { effectApplied: true, words: WORDS })!;
    const second = record.settled({ actionId: PRESS, parameters: {}, consequences: ["modify_existing"], row: flow[1]!, stage: "forward" }, { effectApplied: true, words: WORDS })!;
    expect(first.id).not.toBe(second.id);
    expect(first.rowIdentity).not.toBe(second.rowIdentity);
    expect(PEOPLE.map((row) => record.rowDone(row))).toEqual([true, true, false]);
  });

  it("a real run's row, reshaped again, is refused through what the record persisted", () => {
    const record = pressedByHand(PEOPLE, "Ximena Ruiz, Happy to swap notes on the market");
    const data = parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(record.data())));
    expect(data.ok).toBe(true);
    const held = new AutomationStudioAttemptActRecord(data.ok ? { seed: data.data } : {});
    const call = { actionId: PRESS, parameters: { target: { handle: "t9" } } };
    expect(held.carried({ ...call, row: { who: "Ximena Ruiz" } })).toBeDefined();
    expect(held.carried({ ...call, row: { who: "Lucia Romano" } })).toBeUndefined();
  });

  it("a read of quite different columns finds the row in the press's own sentence, and a word every other row holds ties nobody", () => {
    const record = pressedByHand([{ name: "Ximena Ruiz" }, { name: "Lucia Romano" }], "Ximena Ruiz, Data lead at Kade Energy, through its Accept");
    const flow = [{ headline: "Data lead at Kade Energy", action: "Accept" }, { headline: "Recruiter at Orbis", action: "Accept" }];
    record.noteReadRows(flow);
    expect(flow.map((row) => record.rowDone(row))).toEqual([true, false]);
    const left = [{ headline: "Recruiter at Orbis", action: "Accept" }, { headline: "Buyer for Moss", action: "Accept" }];
    record.noteReadRows(left);
    expect(left.map((row) => record.rowDone(row))).toEqual([false, false]);
  });

  it("reads a record written before reads were counted", () => {
    const record = pressedByHand(PEOPLE, "Ximena Ruiz, Happy to swap notes on the market");
    const old = record.data();
    for (const row of old.rows) {
      delete row.reads;
      delete row.commonPaths;
      for (const field of row.fields) delete field.common;
    }
    const held = new AutomationStudioAttemptActRecord({ seed: old });
    expect(held.rowDone({ who: "Ximena Ruiz" })).toBe(true);
    expect(held.rowDone({ who: "Lucia Romano" })).toBe(false);
  });
});
