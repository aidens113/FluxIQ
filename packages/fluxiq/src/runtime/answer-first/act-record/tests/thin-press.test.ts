// A press that knows little of its row (t869 follow-up): a control's label, or one word. An "accept each" task must
// press every row once: a row never pressed is not held done because it carries the press's word, and the row
// pressed is not pressed again. Invitations from made-up people.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActGate, type AutomationStudioAttemptActCall } from "../index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";

const WORDS = { what: "Accepted", where: "On a list" };
const person = (name: string, action = "Accept"): JsonObject => ({ name, action });
const LIST = [person("Ada Lind"), person("Ben Okoro"), person("Cyd Marsh")];
const ACCEPT = { selector: "#list > div:nth-of-type(1) > button", element: { tag: "button", accessibleName: "Accept" } };

const press = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "web.click", parameters: ACCEPT, consequences: ["modify_existing"], stage: "exploration", ...over });
const landed = (record: AutomationStudioAttemptActRecord, call: AutomationStudioAttemptActCall, actedOn?: string) => record.settled(call, { effectApplied: true, words: WORDS, ...(actedOn ? { actedOn } : {}) });
const withList = (rows: readonly JsonObject[] = LIST) => {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows([...rows]);
  return record;
};
const done = (record: AutomationStudioAttemptActRecord, rows: readonly JsonObject[]) => rows.map((row) => record.rowDone(row));

/** A press by hand through the real gate, answered as a domain answers: the sentence for the model, and the item's whole words for the record. */
async function byHand(record: AutomationStudioAttemptActRecord, answer: { actedOn: string; actedOnItem?: string }): Promise<void> {
  const gate = automationStudioAttemptActGate({
    record,
    executeTool: async (): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, pageChanged: true, ...answer }, effectApplied: true, draft: { actionId: "web.click", effect: "mutate", proposes: true } })
  });
  await gate({ callId: "by-hand", toolId: "core.run_node", value: { node: "web.click", parameters: { target: { handle: "t9" } }, consequences: ["modify_existing"] } });
}

const THROUGH = `only, through its "Accept"; no other item was acted on.`;

describe("a row a pass carried that says only its control's own name", () => {
  it("after the read: no row is held done for the word", () => {
    const record = withList();
    landed(record, press({ row: { action: "Accept" } }));
    expect(done(record, LIST)).toEqual([false, false, false]);
  });

  it("before any read: no later row is held done for the word", () => {
    const record = new AutomationStudioAttemptActRecord();
    landed(record, press({ row: { action: "Accept" } }));
    record.noteReadRows([...LIST]);
    expect(done(record, LIST)).toEqual([false, false, false]);
  });

  it("a later read that shows what the press changed says which row it was, and the others stay not done", () => {
    const record = withList();
    landed(record, press({ row: { action: "Accept" } }));
    const after = [person("Ada Lind", "Accepted"), person("Ben Okoro"), person("Cyd Marsh")];
    record.noteReadRows(after);
    expect(done(record, after)).toEqual([true, false, false]);
    expect(record.admit(press({ row: after[0]! })).kind).toBe("already_done");
    expect(record.admit(press({ row: after[1]! })).kind).toBe("run");
  });

  it("known limit, pressed again: a press that leaves no mark on any read holds no row, so nothing stops its row coming round", () => {
    const record = withList();
    landed(record, press({ row: { action: "Accept" } }));
    record.noteReadRows([...LIST]);
    expect(done(record, LIST)).toEqual([false, false, false]);
  });

  it("a word that is no control's name still ties, as a run's row in a shape that fits two does", () => {
    const record = withList([{ name: "Ada Lind", city: "Leeds" }, { name: "Ben Okoro", city: "Leeds" }]);
    landed(record, press({ row: { city: "Leeds" } }));
    expect(done(record, [{ name: "Ada Lind", city: "Leeds" }, { name: "Ben Okoro", city: "Leeds" }])).toEqual([true, true]);
  });
});

describe("a press by hand, through the gate, as the page answers it", () => {
  const CITIES = [{ city: "Leeds", action: "Accept" }, { city: "York", action: "Accept" }, { city: "Hull", action: "Accept" }];

  it("a read of columns the sentence never reached: the item's whole words find its row, whatever the control is called", async () => {
    const record = withList(CITIES);
    await byHand(record, { actedOn: `This acted on item 1/3 (Ada Lind, Recruiter) ${THROUGH}`, actedOnItem: "item 1/3 (Ada Lind, Recruiter, Leeds, Says hello)" });
    expect(done(record, CITIES)).toEqual([true, false, false]);
  });

  it("the place alone: no row is held for the control's name, and the next read says which by what it changed", async () => {
    const record = withList();
    await byHand(record, { actedOn: `This acted on item 1/3 ${THROUGH}`, actedOnItem: "item 1/3" });
    expect(done(record, LIST)).toEqual([false, false, false]);
    const after = [person("Ada Lind", "Accepted"), person("Ben Okoro"), person("Cyd Marsh")];
    record.noteReadRows(after);
    expect(done(record, after)).toEqual([true, false, false]);
  });

  it("a row the press took off the list: held on it, and every row still there goes on", async () => {
    const record = withList();
    await byHand(record, { actedOn: `This acted on item 1/3 ${THROUGH}`, actedOnItem: "item 1/3" });
    record.noteReadRows(LIST.slice(1));
    expect(record.rowDone(LIST[0]!)).toBe(true);
    expect(done(record, LIST.slice(1))).toEqual([false, false]);
  });

  it("a later read of other columns says nothing yet, and the read after it that shows a change does", async () => {
    const record = withList();
    await byHand(record, { actedOn: `This acted on item 1/3 ${THROUGH}`, actedOnItem: "item 1/3" });
    const otherShape = [{ who: "Ada Lind" }, { who: "Ben Okoro" }, { who: "Cyd Marsh" }];
    record.noteReadRows(otherShape);
    expect(done(record, otherShape)).toEqual([false, false, false]);
    const after = [person("Ada Lind", "Accepted"), person("Ben Okoro"), person("Cyd Marsh")];
    record.noteReadRows(after);
    expect(done(record, after)).toEqual([true, false, false]);
  });

  it("the same act's mark survives a restart, with what it still has to learn", async () => {
    const record = withList();
    await byHand(record, { actedOn: `This acted on item 1/3 ${THROUGH}`, actedOnItem: "item 1/3" });
    const again = new AutomationStudioAttemptActRecord({ seed: record.data() });
    const after = [person("Ada Lind", "Accepted"), person("Ben Okoro"), person("Cyd Marsh")];
    again.noteReadRows(after);
    expect(done(again, after)).toEqual([true, false, false]);
  });

  it("a host that says only a sentence: its words fit every row, so all are held and told, as before", async () => {
    const record = withList();
    await byHand(record, { actedOn: `This acted on item 1/3 ${THROUGH}` });
    expect(done(record, LIST)).toEqual([true, true, true]);
  });
});

describe("the row pressed, whatever little the press knew of it", () => {
  it("named by the sentence: held done, and the others not", () => {
    const record = withList();
    landed(record, press(), `This acted on item 1/3 (Ada Lind) ${THROUGH}`);
    expect(done(record, LIST)).toEqual([true, false, false]);
  });

  it("named by its address: the page it was pressed on says which", () => {
    const rows = LIST.map((row, index) => ({ ...row, link: `/in/${index + 1}` }));
    const record = withList(rows);
    record.notePlace({ url: "https://site.test/in/1" });
    landed(record, press());
    expect(done(record, rows)).toEqual([true, false, false]);
  });

  it("carried whole on its pass: held done in any shape, and not pressed again", () => {
    const record = withList();
    landed(record, press({ row: person("Ada Lind"), stage: "forward" }));
    expect(record.rowDone({ who: "Ada Lind", action: "Accept", since: "2 days ago" })).toBe(true);
    expect(record.rowDone({ who: "Ben Okoro", action: "Accept", since: "2 days ago" })).toBe(false);
  });
});

describe("two acts on one row (`../record.ts`, `matches`)", () => {
  const icon = (name: string) => ({ selector: `.${name}`, element: { tagName: "button", classNames: [name] } });
  const ROW = person("Ada Lind");
  const onRow = (parameters: JsonObject) => press({ parameters, row: ROW });

  it("two controls with no words, told by their fingerprints: the second is not the first", () => {
    const record = withList();
    landed(record, onRow(icon("keep")));
    expect(record.admit(onRow(icon("share"))).kind).toBe("run");
    expect(record.admit(onRow(icon("keep"))).kind).toBe("already_done");
  });

  // The one with no words may be a thinner form of the named one, which nothing here tells from another control, and a row's act
  // done twice cannot be taken back. Until a control's kind stopped counting as its words, every web button said "button", so
  // these two were held the same that way already; now it is said (`./kind-is-no-control-word.test.ts`).
  it("a named control and one with no words: held the same, since it may be the named one's thinner form", () => {
    const record = withList();
    landed(record, onRow(ACCEPT));
    expect(record.admit(onRow(icon("share"))).kind).toBe("already_done");
  });

  it("the same control by hand and in a loop, where one form says nothing of it: still one act", () => {
    const record = withList();
    landed(record, onRow({ target: { handle: "t9" } }));
    expect(record.admit(onRow(icon("keep"))).kind).toBe("already_done");
    const other = withList();
    landed(other, onRow(icon("keep")));
    expect(other.admit(onRow({ control: "keep" })).kind).toBe("already_done");
  });

  it("the same words under other selectors: still one control", () => {
    const record = withList();
    landed(record, onRow({ selector: "#a", element: { tag: "button", accessibleName: "Save" } }));
    expect(record.admit(onRow({ selector: "#b", element: { tag: "div", accessibleName: "Save" } })).kind).toBe("already_done");
  });

  it("add 3, on no row: three presses of one unnamed control land, and a fourth is refused", () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 3 });
    const add = press({ parameters: icon("add") });
    for (let landing = 0; landing < 3; landing += 1) {
      expect(record.admit(add).kind).toBe("run");
      landed(record, add);
    }
    expect(record.admit(add).kind).toBe("already_done");
  });

  it("add 3, by hand on a list's item: the item's words name its row, and three presses still land", async () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 3 });
    record.noteReadRows([...LIST]);
    const add = press({ parameters: icon("add") });
    for (let landing = 0; landing < 3; landing += 1) {
      expect(record.admit(add).kind).toBe("run");
      landed(record, add, `This acted on item 1/3 (Ada Lind) ${THROUGH}`);
    }
    expect(record.admit(add).kind).toBe("already_done");
  });
});
