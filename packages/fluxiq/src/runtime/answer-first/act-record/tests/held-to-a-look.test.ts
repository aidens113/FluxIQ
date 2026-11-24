// A press an earlier attempt held only to a look, as a real run reads it (t994, F23; `../record.ts`,
// "A held press on a replay"): `carriedHold` says a call's match stands only by such holds and refuses
// nothing, and its `letGo` lets those holds go for this attempt alone. A ferry booking's stepper
// stands in, unrelated to any realistic scenario.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed, type AutomationStudioAttemptActCall } from "../index.ts";

const WORDS = { what: "Next", where: "On the booking page" };
const NEXT = { selector: ".steps .next", element: { tagName: "button", text: "Next" } };
const SAVE = { selector: ".steps .save", element: { tagName: "button", text: "Save" } };
const call = (parameters = NEXT, consequences: string[] = []): AutomationStudioAttemptActCall => ({ actionId: "ferry.press", parameters, consequences, stage: "exploration" });
const forRun = (parameters = NEXT) => ({ actionId: "ferry.press", parameters, counted: true });

/** A later attempt's record: the first attempt's Next, undeclared and changing a line that stays, and its declared Save. */
function later(): AutomationStudioAttemptActRecord {
  const first = new AutomationStudioAttemptActRecord();
  first.settled(call(), { effectApplied: true, words: WORDS, changedState: true });
  first.settled(call(SAVE, ["modify_existing"]), { effectApplied: true, words: { what: "Saved the booking", where: "On the booking page" } });
  return new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.data() })! });
}

describe("a press held only to a look, on a real run", () => {
  it("is read as held to a look without being refused or counted", () => {
    const record = later();
    expect(record.carriedHold(forRun())).toMatchObject({ toALook: true, act: { state: "may_have_landed" } });
    expect(record.rowsHeldDone()).toBe(0);
    // Read twice, still there: the read changes nothing.
    expect(record.carriedHold(forRun())?.toALook).toBe(true);
    expect(record.carried(forRun())).toBeDefined();
  });

  it("a declared act is never held only to a look", () => {
    expect(later().carriedHold(forRun(SAVE))).toMatchObject({ toALook: false, act: { state: "landed" } });
  });

  it("let go when the page shows none of its effect: no longer refused in this attempt, held again in the next", async () => {
    const written: unknown[] = [];
    const first = new AutomationStudioAttemptActRecord();
    first.settled(call(), { effectApplied: true, words: WORDS, changedState: true });
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.data() })!, persist: async (data) => void written.push(data) });
    record.carriedHold(forRun())!.letGo();
    await record.flushed();
    expect(written).toHaveLength(1);
    expect(record.carriedHold(forRun())).toBeUndefined();
    expect(record.carried(forRun())).toBeUndefined();
    expect(automationStudioAttemptActSeed({ data: record.data() })!.acts[0]).toMatchObject({ undeclared: true, changedState: true, heldOnRepeat: true, carried: true });
  });

  it("letting go leaves a declared act it does not hold to a look as it was", () => {
    const record = later();
    record.carriedHold(forRun(SAVE))!.letGo();
    expect(record.carried(forRun(SAVE))).toMatchObject({ state: "landed" });
  });
});
