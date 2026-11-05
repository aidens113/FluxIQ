// What a new attempt starts its act record with (t870; `../seed.ts`, the design's table).

import { AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
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

describe("the seed of a new attempt", () => {
  it("is nothing after an achieved attempt: a person asking again means it", () => {
    expect(automationStudioAttemptActSeed({ status: "achieved", data: held().data() })).toBeUndefined();
  });

  for (const status of AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES.filter((word) => word !== "achieved")) {
    it(`after ${status}, keeps what landed and what may have, and the new record refuses both`, () => {
      const seed = automationStudioAttemptActSeed({ status, data: held().data() })!;
      expect(parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(seed))).ok).toBe(true);
      const record = new AutomationStudioAttemptActRecord({ seed });
      expect(record.admit(call({ actionId: "by.hand" })).kind).toBe("already_done");
      expect(record.admit(call({ actionId: "maybe" })).kind).toBe("look_first");
      expect(record.acts().map((act) => act.state)).toEqual(["landed", "may_have_landed"]);
    });
  }

  it("keeps the rows an act is on, by their values, and no handle of the attempt before", () => {
    const record = new AutomationStudioAttemptActRecord();
    const row = { title: "Old Roads", link: "/loans/17", $handle: "t2" };
    record.settled(call({ row }), { effectApplied: true, words: WORDS });
    const seed = automationStudioAttemptActSeed({ status: "budget_out", data: record.data() })!;
    expect(seed.rows.every((held) => held.handles.length === 0)).toBe(true);
    expect(new AutomationStudioAttemptActRecord({ seed }).rowDone({ book: "Old Roads", href: "https://library.test/loans/17" })).toBe(true);
  });

  it("asks a look of its own, since the one before it looked at a page as it stood then", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call(), { effectApplied: false, uncertain: true, words: WORDS });
    expect(before.admit(call()).kind).toBe("look_first");
    before.looked();
    expect(before.admit(call()).kind).toBe("run");
    const seed = automationStudioAttemptActSeed({ status: "stopped_by_person", data: before.data() })!;
    expect(new AutomationStudioAttemptActRecord({ seed }).admit(call()).kind).toBe("look_first");
  });

  it("holds no page of the attempt before: a by-hand act of the new one is not tied to a row by it", () => {
    const seed = automationStudioAttemptActSeed({ status: "budget_out", data: held().data() })!;
    expect(seed.place).toBeUndefined();
  });

  it("drops a handle the act has another form for, since another attempt's handle may be any control", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call({ parameters: { target: { handle: "t7" } } }), { effectApplied: true, words: WORDS, ranWith: { parameters: FROZEN } });
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ status: "budget_out", data: before.data() })! });
    expect(record.admit(call({ parameters: { target: { handle: "t7" } } }))).toEqual({ kind: "run" });
    expect(record.admit(call())).toMatchObject({ kind: "already_done" });
  });

  it("keeps a handle where it is all that is known of an act that may have landed: it costs one look", async () => {
    const before = new AutomationStudioAttemptActRecord();
    await before.begun(call({ parameters: { target: { handle: "t7" } } }), WORDS);
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ status: "working", data: before.data() })! });
    expect(record.admit(call({ parameters: { target: { handle: "t7" } } })).kind).toBe("look_first");
  });

  it("leaves out what neither landed nor may have, and is nothing where that is all there was", () => {
    const before = new AutomationStudioAttemptActRecord();
    before.settled(call(), { effectApplied: true, words: WORDS });
    const data = before.data();
    data.acts[0]!.state = "not_done";
    expect(automationStudioAttemptActSeed({ status: "budget_out", data })).toBeUndefined();
    data.acts[0]!.state = "undone";
    expect(automationStudioAttemptActSeed({ status: "budget_out", data })).toBeUndefined();
  });

  it("changes nothing it was given", () => {
    const data = held().data();
    const copy = structuredClone(data);
    automationStudioAttemptActSeed({ status: "budget_out", data });
    expect(data).toEqual(copy);
  });
});
