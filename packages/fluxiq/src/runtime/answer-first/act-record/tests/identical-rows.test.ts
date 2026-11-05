// Rows nobody can tell apart (t870): what the record says of a press on one, the one thing that lets
// such a press go, and how many rows an attempt left out. A lending library.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActCall } from "../index.ts";

const WORDS = { what: "Renewed", where: "On the account" };
const TITLE = "Atlas of Rivers";
const EAST = { title: TITLE, wing: "East wing" };
const WEST = { title: TITLE, wing: "West wing" };
const BIRDS = { title: "Birds of the Coast", wing: "North wing" };
const FIRST = { title: TITLE, due: "2026-11-20" };
const SECOND = { title: TITLE, due: "2026-12-01" };

const withRows = (rows: readonly JsonObject[]) => {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows([...rows]);
  return record;
};
/** A press by a handle no read printed, with the words the domain says of it, in a fingerprint of its own. */
const byHandle = (words: string, handle = "t9"): AutomationStudioAttemptActCall => ({ actionId: "press", parameters: { target: { handle } }, consequences: ["modify_existing"], stage: "exploration", foreseen: { words, parameters: { element: { label: "Renew", context: { record: words } } } } });
/** A run's pass on the row in the shape its For Each hands on, with no word of which item it was. */
const passOn = (record: AutomationStudioAttemptActRecord, row: JsonObject) => record.settled({ actionId: "press", parameters: { control: "Renew" }, consequences: ["modify_existing"], stage: "run", row }, { effectApplied: true, words: WORDS });
/** A by-hand press whose answer names the item it acted on. */
const byHandWith = (record: AutomationStudioAttemptActRecord, actedOn: string, handle = "t1") => record.settled(byHandle("Renew", handle), { effectApplied: true, words: WORDS, actedOn });

describe("what a refusal says of the row", () => {
  it("a row that is known says it plainly", () => {
    const record = withRows([EAST, WEST, BIRDS]);
    passOn(record, BIRDS);
    expect(record.admit(byHandle(`Renew ${BIRDS.title}`))).toEqual(expect.objectContaining({ kind: "already_done" }));
    expect(record.admit(byHandle(`Renew ${BIRDS.title}`))).not.toHaveProperty("rowsUnclear");
  });

  it("an act on no row says it plainly", () => {
    const record = new AutomationStudioAttemptActRecord();
    const card = { actionId: "press", parameters: { selector: "#card" }, consequences: ["modify_existing"], stage: "exploration" as const };
    record.settled(card, { effectApplied: true, words: WORDS });
    expect(record.admit(card)).not.toHaveProperty("rowsUnclear");
  });

  it("words that fit two rows say several fit", () => {
    const record = withRows([FIRST, SECOND, BIRDS]);
    passOn(record, FIRST);
    expect(record.admit(byHandle(`Renew ${TITLE}`))).toEqual(expect.objectContaining({ kind: "already_done", rowsUnclear: true }));
  });

  it("a row an act was on in a shape that fits two says several fit, on either", () => {
    const record = withRows([EAST, WEST]);
    passOn(record, { title: TITLE });
    for (const wing of [EAST.wing, WEST.wing]) expect(record.admit(byHandle(`Renew ${TITLE} ${wing}`))).toEqual(expect.objectContaining({ kind: "already_done", rowsUnclear: true }));
  });

  it("a row a read returned twice, value for value, says several fit", () => {
    const record = withRows([{ title: TITLE }, { title: TITLE }, BIRDS]);
    passOn(record, { title: TITLE });
    expect(record.admit(byHandle(`Renew ${TITLE}`))).toEqual(expect.objectContaining({ kind: "already_done", rowsUnclear: true }));
  });
});

describe("what lets such a press go", () => {
  it("a read that came after an act whose answer named its item: the other row goes, and the one it named does not", () => {
    const record = withRows([{ title: TITLE }]);
    byHandWith(record, `This acted on ${TITLE} ${EAST.wing} only, through its "Renew"; no other item was acted on.`);
    record.noteReadRows([EAST, WEST]);
    expect(record.admit(byHandle(`Renew ${TITLE} ${WEST.wing}`, "t2")).kind).toBe("run");
    expect(record.admit(byHandle(`Renew ${TITLE} ${EAST.wing}`, "t3"))).toEqual(expect.objectContaining({ kind: "already_done" }));
    expect(record.admit(byHandle(`Renew ${TITLE} ${EAST.wing}`, "t3"))).not.toHaveProperty("rowsUnclear");
    expect(record.rowDone(WEST)).toBe(false);
    expect(record.rowDone(EAST)).toBe(true);
  });

  it("a full row acted on is told from another by a read, with nothing more", () => {
    const record = withRows([EAST, WEST]);
    passOn(record, EAST);
    expect(record.admit(byHandle(`Renew ${TITLE} ${WEST.wing}`)).kind).toBe("run");
  });

  it("the second row then goes, and neither goes twice", () => {
    const record = withRows([{ title: TITLE }]);
    byHandWith(record, `This acted on ${TITLE} ${EAST.wing} only; no other item was acted on.`);
    record.noteReadRows([EAST, WEST]);
    const west = byHandle(`Renew ${TITLE} ${WEST.wing}`, "t2");
    expect(record.admit(west).kind).toBe("run");
    record.settled(west, { effectApplied: true, words: WORDS, actedOn: `This acted on ${TITLE} ${WEST.wing} only; no other item was acted on.` });
    for (const wing of [EAST.wing, WEST.wing]) expect(record.admit(byHandle(`Renew ${TITLE} ${wing}`, `t-${wing}`)).kind).toBe("already_done");
  });
});

describe("what stays refused, since it cannot be known", () => {
  it("a run's act in a shape that fits two, whose answer named no item: a read tells the rows apart and says nothing of which it was, so both stay held", () => {
    const record = withRows([{ title: TITLE }]);
    passOn(record, { title: TITLE });
    record.noteReadRows([EAST, WEST]);
    expect(record.admit(byHandle(`Renew ${TITLE} ${EAST.wing}`)).kind).toBe("already_done");
    expect(record.admit(byHandle(`Renew ${TITLE} ${WEST.wing}`)).kind).toBe("already_done");
    expect(record.rowDone(EAST)).toBe(true);
    expect(record.rowDone(WEST)).toBe(true);
  });

  it("an answer whose words fit both, however many landings there are against how many rows", () => {
    const record = withRows([EAST, WEST]);
    byHandWith(record, `This acted on ${TITLE} only; no other item was acted on.`);
    expect(record.admit(byHandle(`Renew ${TITLE} ${WEST.wing}`, "t2")).kind).toBe("already_done");
    expect(record.admit(byHandle(`Renew ${TITLE} ${EAST.wing}`, "t3")).kind).toBe("already_done");
  });

  it("rows that differ only by a date: a sentence's bare numbers may be a place, so they name no row", () => {
    const record = withRows([{ title: TITLE }]);
    byHandWith(record, `This acted on ${TITLE} ${FIRST.due} only; no other item was acted on.`);
    record.noteReadRows([FIRST, SECOND]);
    expect(record.admit(byHandle(`Renew ${TITLE} ${SECOND.due}`, "t2")).kind).toBe("already_done");
  });

  it("a press with the act's own key, whatever its words now say: one control is one control", () => {
    const record = withRows([{ title: TITLE }]);
    const frozen = { selector: "#renew-1", element: { label: "Renew" } };
    record.settled({ actionId: "press", parameters: frozen, consequences: ["modify_existing"], stage: "exploration" }, { effectApplied: true, words: WORDS, actedOn: `This acted on ${TITLE} ${EAST.wing} only.` });
    record.noteReadRows([EAST, WEST]);
    expect(record.admit({ actionId: "press", parameters: { target: { handle: "t2" } }, consequences: ["modify_existing"], stage: "exploration", foreseen: { words: `Renew ${TITLE} ${WEST.wing}`, parameters: frozen } }).kind).toBe("already_done");
  });

  it("a row the record does not hold is never said to differ: the act's row fits it, so it stays held", () => {
    const record = withRows([{ title: TITLE }]);
    byHandWith(record, `This acted on ${TITLE} only; no other item was acted on.`);
    record.noteReadRows([EAST]);
    expect(record.rowDone({ title: TITLE, wing: "South wing", shelf: "Top" })).toBe(true);
  });
});

describe("a control the look before the press names by the label beside it", () => {
  const ADDRESS = "form > div:nth-of-type(2) > div";
  /** What the domain says and what the press kept, as `domain/.../node-run/tests/labelled-press/tests/identity.test.ts` holds them. */
  const THIN = { selector: ADDRESS, element: { tagName: "div", role: "button", selector: ADDRESS } };
  const THICK = { selector: ADDRESS, element: { ...THIN.element, label: "Keep me posted" } };
  const press = (handle: string, foreseen: JsonObject): AutomationStudioAttemptActCall => ({ actionId: "press", parameters: { target: { handle } }, consequences: ["modify_existing"], stage: "exploration", foreseen: { parameters: foreseen } });

  it("a second press by a new handle from a look that names it no way is refused, by the form the first was foreseen in", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press("t1", THIN), { effectApplied: true, words: WORDS, ranWith: { parameters: THICK } });
    expect(record.admit(press("t8", THIN)).kind).toBe("already_done");
  });

  it("from a look that does name it, by what the first ran with", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press("t1", THIN), { effectApplied: true, words: WORDS, ranWith: { parameters: THICK } });
    expect(record.admit(press("t8", THICK)).kind).toBe("already_done");
  });

  it("known limit: a label a later look loses, at an address that counts places, reads as another control, as a control whose words changed does", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press("t1", THICK), { effectApplied: true, words: WORDS, ranWith: { parameters: THICK } });
    expect(record.admit(press("t8", THIN)).kind).toBe("run");
  });

  it("another control at another place with the same bare fingerprint goes", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press("t1", THIN), { effectApplied: true, words: WORDS, ranWith: { parameters: THICK } });
    const elsewhere = "form > div:nth-of-type(3) > div";
    expect(record.admit(press("t8", { selector: elsewhere, element: { tagName: "div", role: "button", selector: elsewhere } })).kind).toBe("run");
  });
});

describe("how many rows an attempt left out", () => {
  it("counts a forward pass's, a run's and a press's, each row once, in any shape", () => {
    const record = withRows([EAST, WEST, BIRDS]);
    passOn(record, BIRDS);
    expect(record.rowsHeldDone()).toBe(0);
    expect(record.rowDone(BIRDS)).toBe(true);
    expect(record.rowDone(BIRDS)).toBe(true);
    expect(record.rowsHeldDone()).toBe(1);
    expect(record.admit(byHandle(`Renew ${BIRDS.title}`)).kind).toBe("already_done");
    expect(record.rowsHeldDone()).toBe(1);
    passOn(record, EAST);
    expect(record.carried({ actionId: "press", parameters: { control: "Renew" }, row: EAST })).toBeDefined();
    expect(record.rowsHeldDone()).toBe(2);
  });

  it("a row not held done, and a press on no row, count nothing", () => {
    const record = withRows([EAST, WEST]);
    passOn(record, EAST);
    expect(record.rowDone(WEST)).toBe(false);
    expect(record.rowsHeldDone()).toBe(0);
    const card = { actionId: "press", parameters: { selector: "#card" }, consequences: ["modify_existing"], stage: "exploration" as const };
    record.settled(card, { effectApplied: true, words: WORDS });
    expect(record.admit(card).kind).toBe("already_done");
    expect(record.rowsHeldDone()).toBe(0);
  });

  it("words that fit two rows are one row left out", () => {
    const record = withRows([FIRST, SECOND, BIRDS]);
    passOn(record, FIRST);
    expect(record.admit(byHandle(`Renew ${TITLE}`)).kind).toBe("already_done");
    expect(record.rowsHeldDone()).toBe(1);
  });

  it("two rows a read returned value for value are two to a forward run, each once however many times it runs, and a real run that showed no read says one", () => {
    const record = withRows([{ title: TITLE }, { title: TITLE }, BIRDS]);
    passOn(record, { title: TITLE });
    for (const _ of [1, 2, 3, 4]) expect(record.rowDone({ title: TITLE })).toBe(true);
    expect(record.rowsHeldDone()).toBe(2);
    const noRead = new AutomationStudioAttemptActRecord();
    passOn(noRead, { title: TITLE });
    for (const _ of [1, 2]) expect(noRead.carried({ actionId: "press", parameters: { control: "Renew" }, row: { title: TITLE } })).toBeDefined();
    expect(noRead.rowsHeldDone()).toBe(1);
  });

  it("a press on such a row is one row left out, however many times it is refused", () => {
    const record = withRows([{ title: TITLE }, { title: TITLE }, BIRDS]);
    passOn(record, { title: TITLE });
    for (const handle of ["t1", "t2", "t3"]) expect(record.admit(byHandle(`Renew ${TITLE}`, handle)).kind).toBe("already_done");
    expect(record.rowsHeldDone()).toBe(1);
  });

  it("a saved step with no row of its own leaves out the row its act was on, by a run, a forward run and by hand, once", () => {
    const step = { actionId: "press", parameters: { title: BIRDS.title }, consequences: ["modify_existing"], stage: "exploration" as const };
    const fresh = () => {
      const record = withRows([EAST, WEST, BIRDS]);
      record.settled(step, { effectApplied: true, words: WORDS, actedOn: `This acted on ${BIRDS.title} only; no other item was acted on.` });
      return record;
    };
    const run = fresh();
    expect(run.carried({ actionId: step.actionId, parameters: step.parameters })).toBeDefined();
    expect(run.carried({ actionId: step.actionId, parameters: step.parameters })).toBeDefined();
    expect(run.rowsHeldDone()).toBe(1);
    const forward = fresh();
    expect(forward.stepDone(step)).toBe(true);
    expect(forward.rowsHeldDone()).toBe(1);
    const byHand = fresh();
    expect(byHand.admit(step).kind).toBe("already_done");
    expect(byHand.rowsHeldDone()).toBe(1);
  });

  it("an act it may have made, on a row, is left out while refused, and not once it goes after a look", () => {
    const record = withRows([EAST, WEST]);
    const press = byHandle(`Renew ${TITLE} ${WEST.wing}`);
    record.settled(press, { effectApplied: false, uncertain: true, words: WORDS });
    expect(record.admit(press).kind).toBe("look_first");
    expect(record.rowsHeldDone()).toBe(1);
    record.looked();
    expect(record.admit(press).kind).toBe("run");
    record.settled(press, { effectApplied: true, words: WORDS });
    expect(record.rowsHeldDone()).toBe(0);
  });

  it("does not change what is persisted", () => {
    const record = withRows([EAST, WEST]);
    passOn(record, EAST);
    const before = JSON.stringify(record.data());
    record.rowDone(EAST);
    expect(JSON.stringify(record.data())).toBe(before);
  });
});
