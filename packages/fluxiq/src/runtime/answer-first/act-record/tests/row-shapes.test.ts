// One row across the shapes it really reaches the record in (t870, plan D6; `../row-ties.ts`,
// `sameAs`). A by-hand read holds a row with a handle and a link from the page's origin; a
// walker's pass holds it whole; a Flow's For Each hands it on after a record output reshaped
// it. A lending library's loans stand in: unrelated to any realistic scenario.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActForward, automationStudioAttemptActGate, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActCall } from "../index.ts";

const WORDS = { what: "Renewed a loan", where: "On the loans page" };
const RENEW = { selector: ".renew", element: { text: "Renew" } };
const renew = (row?: JsonObject, parameters: JsonObject = RENEW): AutomationStudioAttemptActCall => ({ actionId: "library.press", parameters, consequences: ["modify_existing"], stage: "exploration", ...(row ? { row } : {}) });
const landed = { effectApplied: true, words: WORDS };

/** The loan as a by-hand read holds it: a handle it minted, a reference it minted, and a link from the page's origin. */
const BY_HAND: JsonObject = { title: "The Long Winter", member: "Ann Lee", due: "2026-11-20", copies: "2", fee: "1,250.00", link: "/loans/17", $handle: "t3", evidenceRef: "read-1" };

const SHAPES: Array<[string, JsonObject]> = [
  ["read again, with other handles", { ...BY_HAND, $handle: "t88", evidenceRef: "read-9" }],
  ["under renamed keys", { book: "The Long Winter", borrower: "Ann Lee", dueOn: "2026-11-20", count: "2", charge: "1,250.00", href: "/loans/17" }],
  ["with a column dropped", { title: "The Long Winter", member: "Ann Lee", link: "/loans/17" }],
  ["with a whole address", { title: "The Long Winter", member: "Ann Lee", due: "2026-11-20", copies: "2", fee: "1,250.00", link: "https://library.test/loans/17" }],
  ["with a number read back from text", { title: "The Long Winter", member: "Ann Lee", due: "2026-11-20", copies: 2, fee: 1250, link: "/loans/17" }],
  ["reshaped every way at once", { book: "The Long Winter", borrower: "Ann Lee", count: 2, href: "https://library.test/loans/17" }]
];

function acted(row: JsonObject): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  record.settled(renew(row), landed);
  return record;
}

describe("the same row in another shape", () => {
  for (const [shape, row] of SHAPES) {
    it(`counts as done ${shape}: for rowDone, a forward run, carried, and the gate's check`, () => {
      const record = acted(BY_HAND);
      expect(record.rowDone(row)).toBe(true);
      expect(automationStudioAttemptActForward(record).rowDone(row)).toBe(true);
      expect(record.carried({ actionId: "library.press", parameters: RENEW, row })).toBeDefined();
      expect(record.admit(renew(row)).kind).toBe("already_done");
    });

    it(`counts as done the other way round: acted ${shape}, asked as a by-hand read holds it`, () => {
      const record = acted(row);
      expect(record.rowDone(BY_HAND)).toBe(true);
      expect(record.carried({ actionId: "library.press", parameters: RENEW, row: BY_HAND })).toBeDefined();
      expect(record.admit(renew(BY_HAND)).kind).toBe("already_done");
    });
  }

  it("reads a by-hand press on a printed handle, then a pass carrying the reshaped row, as one act", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const answers = [
      { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, read: { extracted: [BY_HAND] } }, effectApplied: false, draft: { effect: "observe" as const, proposes: false } },
      { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pageChanged: true }, effectApplied: true, draft: { effect: "mutate" as const, ranWith: { node: "library.press", parameters: RENEW }, proposes: true } }
    ];
    const dispatched: string[] = [];
    const execute = automationStudioAttemptActGate({
      record,
      executeTool: async (call: { callId: string; toolId: string; value: JsonObject }) => {
        dispatched.push(call.callId);
        return answers.shift() ?? answers[0]!;
      }
    });
    await execute({ callId: "read", toolId: "core.run_node", value: { node: "library.read", parameters: {}, consequences: [] } });
    await execute({ callId: "press", toolId: "core.run_node", value: { node: "library.press", parameters: { target: { handle: "t3" } }, consequences: ["modify_existing"] } });
    const reshaped = SHAPES.at(-1)![1];
    expect(record.rowDone(reshaped)).toBe(true);
    await expect(execute({ callId: "pass", toolId: "core.run_node", value: { node: "library.press", parameters: RENEW, consequences: ["modify_existing"], replay: "step", item: reshaped } })).resolves.toMatchObject({ resultCode: "attempt.act_already_done" });
    expect(dispatched).toEqual(["read", "press"]);
  });

  it("holds across a record seeded from what the last one wrote", () => {
    const seed = parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(acted(BY_HAND).data())));
    expect(seed.ok).toBe(true);
    const fresh = new AutomationStudioAttemptActRecord(seed.ok ? { seed: seed.data } : {});
    for (const [, row] of SHAPES) expect(fresh.rowDone(row)).toBe(true);
  });

  it("keeps the row an act is on past the bound on rows held, so another shape of it still counts", () => {
    const record = acted(BY_HAND);
    record.noteReadRows(Array.from({ length: 5_100 }, (_, at) => ({ title: `Book ${at}` })));
    expect(record.data().rows.length).toBeLessThanOrEqual(5_001);
    expect(record.rowDone(SHAPES.at(-1)![1])).toBe(true);
  });

  it("keeps the values hashed: what it persists holds no word of the row", () => {
    const persisted = JSON.stringify(acted(BY_HAND).data());
    for (const secret of ["Winter", "winter", "Ann", "/loans/17", "library.test", "2026-11-20", "1,250"]) expect(persisted).not.toContain(secret);
  });
});

describe("two different rows", () => {
  const loan = (title: string, over: JsonObject = {}): JsonObject => ({ title, due: "2026-11-20", ...over });

  it("sharing a due date only are not the same row, in any shape", () => {
    const record = acted(loan("The Long Winter"));
    expect(record.rowDone(loan("Old Roads"))).toBe(false);
    expect(record.rowDone({ book: "Old Roads", dueOn: "2026-11-20" })).toBe(false);
    expect(record.admit(renew(loan("Old Roads"))).kind).toBe("run");
    expect(record.carried({ actionId: "library.press", parameters: RENEW, row: loan("Old Roads") })).toBeUndefined();
  });

  it("are not one where all that is left of one is a bare date or a bare number: a value with no letter and no address proves nothing", () => {
    const record = acted(loan("The Long Winter", { copies: 2 }));
    expect(record.rowDone({ dueOn: "2026-11-20" })).toBe(false);
    expect(record.rowDone({ count: 2 })).toBe(false);
    expect(record.rowDone({ dueOn: "2026-11-20", count: "2" })).toBe(false);
    const onANumber = acted({ loanNo: 17, due: "2026-11-20" });
    expect(onANumber.rowDone({ reference: 17 })).toBe(false);
  });

  it("are not one where they differ in a column both kept", () => {
    const record = acted({ title: "The Long Winter", member: "Ann Lee" });
    expect(record.rowDone({ title: "The Long Winter", member: "Ben Ray" })).toBe(false);
    expect(record.rowDone({ book: "The Long Winter", borrower: "Ben Ray" })).toBe(false);
    const byLink = acted({ title: "The Long Winter", link: "/loans/17" });
    expect(byLink.rowDone({ title: "The Long Winter", link: "https://library.test/loans/18" })).toBe(false);
    const byCount = acted({ title: "The Long Winter", copies: 2 });
    expect(byCount.rowDone({ title: "The Long Winter", copies: 3 })).toBe(false);
    const byFlag = acted({ title: "The Long Winter", renewed: true });
    expect(byFlag.rowDone({ title: "The Long Winter", renewed: false })).toBe(false);
  });

  it("stay two when an act on one is on another control of the same row", () => {
    const record = acted(BY_HAND);
    const other = { selector: ".reserve", element: { text: "Reserve a copy" } };
    expect(record.admit(renew(SHAPES[1]![1], other)).kind).toBe("run");
    expect(record.admit(renew(SHAPES[1]![1], { selector: "li .again", element: { text: "Renew" } })).kind).toBe("already_done");
  });
});

describe("a row that fits several held rows", () => {
  it("is held done if any of them was acted on, and the row it does not fit is not", () => {
    const record = acted({ title: "The Long Winter", member: "Ann Lee" });
    record.noteReadRows([{ title: "The Long Winter", member: "Ann Lee" }, { title: "The Long Winter", member: "Ben Ray" }]);
    // It may be Ann's, which was acted on, or Ben's, which was not: wrongly held done is a row a judge's no brings back; wrongly held not done is an act done twice.
    expect(record.rowDone({ title: "The Long Winter" })).toBe(true);
    expect(record.rowDone({ title: "The Long Winter", member: "Ben Ray" })).toBe(false);
  });

  it("holds every fuller row done when the act is on a row with few columns left", () => {
    const record = acted({ title: "The Long Winter" });
    expect(record.rowDone({ title: "The Long Winter", member: "Ann Lee" })).toBe(true);
    expect(record.rowDone({ title: "The Long Winter", member: "Ben Ray" })).toBe(true);
    expect(record.rowDone({ title: "Old Roads", member: "Ann Lee" })).toBe(false);
  });

  it("lets an address alone prove it, and a word alone", () => {
    expect(acted(BY_HAND).rowDone({ href: "https://library.test/loans/17" })).toBe(true);
    expect(acted(BY_HAND).rowDone({ book: "The Long Winter" })).toBe(true);
  });
});
