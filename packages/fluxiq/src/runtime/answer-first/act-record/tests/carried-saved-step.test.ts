// t1075, on `run-mwynbry2-f3c88dc7`'s own record: attempt 2's replay pressed attempt 1's landed "+ Add" again, since
// the saved step's node carried `requiresChosen` and its keys matched none of the act's.
//
//   A  Core's run parameters are no identity, so the saved node is the landed act by its keys.
//   B  The act is named by the step its call became when the attempt saves its Flow (`step:s11`), so the step is
//      refused by its name, whatever its parameters say: the carry no longer rests on their shape.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed } from "../index.ts";
import { RUN_MWYNBRY2_ACTION, RUN_MWYNBRY2_ADD_ACT, RUN_MWYNBRY2_ELEMENT, RUN_MWYNBRY2_RAN_WITH, RUN_MWYNBRY2_SAVED_S11, runMwynbry2Seed } from "./run-mwynbry2-add.ts";

/** The names the run gate reads off attempt 1's saved node s11 (`SVC/answer-first/run-acts/run-gate.ts`, `stepNames`). */
const S11 = ["node:node.bootstrap.a835b3a6376e1e7b.main.s11", "step:s11"];

describe("run-mwynbry2: the saved \"+ Add\" against the act attempt 1 landed", () => {
  it("A: the saved node, requiresChosen and all, is the carried act, with no row and no step name", () => {
    const record = new AutomationStudioAttemptActRecord({ seed: runMwynbry2Seed() });
    expect(record.carried({ actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_SAVED_S11 })?.id).toBe(RUN_MWYNBRY2_ADD_ACT.id);
    expect(record.carriedHold({ actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_SAVED_S11, steps: S11 })?.toALook).toBe(false);
  });

  it("B: an act named by its step is refused by that name though its keys say nothing of the node", () => {
    // Keys of no form the node has: a parameter some domain adds later, which no list knows.
    const named = { ...RUN_MWYNBRY2_ADD_ACT, keys: ["0".repeat(64)], steps: ["step:s11"] };
    const record = new AutomationStudioAttemptActRecord({ seed: runMwynbry2Seed(named) });
    expect(record.carried({ actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_SAVED_S11, steps: S11 })?.id).toBe(RUN_MWYNBRY2_ADD_ACT.id);
    // Without the name, nothing else holds it.
    expect(record.carried({ actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_SAVED_S11, steps: ["step:s12"] })).toBeUndefined();
  });

  it("B: the name holds only for the act's own action and control, since a plan key is a position in its Flow", () => {
    const named = { ...RUN_MWYNBRY2_ADD_ACT, keys: ["0".repeat(64)], steps: ["step:s11"] };
    const record = new AutomationStudioAttemptActRecord({ seed: runMwynbry2Seed(named) });
    const checkout = { ...RUN_MWYNBRY2_SAVED_S11, element: { ...RUN_MWYNBRY2_ELEMENT, accessibleName: "Check out" } };
    expect(record.carried({ actionId: RUN_MWYNBRY2_ACTION, parameters: checkout, steps: S11 })).toBeUndefined();
    expect(record.carried({ actionId: "web.output.dom-select", parameters: RUN_MWYNBRY2_SAVED_S11, steps: S11 })).toBeUndefined();
  });
});

describe("naming an attempt's acts by the steps their calls became (record.calls.stepsOf)", () => {
  /** Attempt 1's by-hand press, call c9, by a handle, answered with what it ran with, as the act gate settles it. */
  function pressed(record: AutomationStudioAttemptActRecord, callId: string): void {
    const call = { actionId: RUN_MWYNBRY2_ACTION, parameters: { target: { handle: "t1125" } }, consequences: ["modify_existing"], stage: "exploration" as const, callId };
    record.settled(call, { effectApplied: true, words: { what: "+ Add", where: "On the site" }, ranWith: { parameters: RUN_MWYNBRY2_RAN_WITH } });
  }
  const forms = [{ actionId: RUN_MWYNBRY2_ACTION, parameters: { target: { handle: "t1125" } } }, { actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_RAN_WITH }];

  it("names the act its call made, and the name carries into the next attempt with the act", () => {
    const record = new AutomationStudioAttemptActRecord();
    pressed(record, "c9");
    expect(record.calls.stepsOf([{ callId: "c9", step: "step:s11", forms }])).toBe(1);
    const next = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: record.data() })! });
    expect(next.data().acts[0]?.steps).toEqual(["step:s11"]);
    expect(next.carried({ actionId: RUN_MWYNBRY2_ACTION, parameters: { ...RUN_MWYNBRY2_SAVED_S11, someLaterParameter: true }, steps: S11 })).toBeDefined();
  });

  it("names nothing for a call id two acts answered to, a call that made no act, or a step whose call was another", () => {
    const reused = new AutomationStudioAttemptActRecord();
    pressed(reused, "c1");
    reused.settled({ actionId: RUN_MWYNBRY2_ACTION, parameters: { selector: "#save", element: { tagName: "button", accessibleName: "Save" } }, consequences: ["modify_existing"], stage: "exploration", callId: "c1" }, { effectApplied: true, words: { what: "Save", where: "On the site" } });
    expect(reused.calls.stepsOf([{ callId: "c1", step: "step:s11", forms }])).toBe(0);

    const record = new AutomationStudioAttemptActRecord();
    pressed(record, "c9");
    expect(record.calls.stepsOf([{ callId: "c4", step: "step:s4", forms }])).toBe(0);
    // A step an earlier attempt kept, whose id this attempt's model used again for another control.
    expect(record.calls.stepsOf([{ callId: "c9", step: "step:s3", forms: [{ actionId: RUN_MWYNBRY2_ACTION, parameters: { selector: "#other", element: { tagName: "a", accessibleName: "Deals" } } }] }])).toBe(0);
    expect(record.data().acts[0]?.steps).toBeUndefined();
  });

  it("forgets the call of a begun act its answer withdrew", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const call = { actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_RAN_WITH, consequences: ["modify_existing"], stage: "exploration" as const, callId: "c2" };
    expect(await record.begun(call)).toBe("on_record");
    record.withdrawn(call);
    expect(record.calls.actOf("c2")).toBeUndefined();
    expect(record.calls.stepsOf([{ callId: "c2", step: "step:s2", forms }])).toBe(0);
  });
});
