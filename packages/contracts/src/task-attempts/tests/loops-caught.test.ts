import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS, automationStudioTaskAttemptNoLoopsCaught, readAutomationStudioTaskAttemptLoopsCaught } from "../index.ts";

describe("loops caught", () => {
  it("starts every pattern at nothing", () => {
    const none = automationStudioTaskAttemptNoLoopsCaught();
    expect(Object.keys(none)).toEqual([...AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS]);
    for (const pattern of AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS) expect(none[pattern]).toEqual({ steered: 0, refused: 0, changeApproach: 0, askPerson: 0 });
    expect(automationStudioTaskAttemptNoLoopsCaught().cycle).not.toBe(none.cycle);
  });

  it("reads a fresh copy", () => {
    const caught = automationStudioTaskAttemptNoLoopsCaught();
    caught.near_repeat = { steered: 2, refused: 1, changeApproach: 1, askPerson: 0 };
    const read = readAutomationStudioTaskAttemptLoopsCaught(caught);
    expect(read).toEqual(caught);
    expect(read?.near_repeat).not.toBe(caught.near_repeat);
  });

  it("refuses an unknown pattern, a missing pattern, an unknown count and a count that is not whole", () => {
    const whole = automationStudioTaskAttemptNoLoopsCaught();
    expect(readAutomationStudioTaskAttemptLoopsCaught({ ...whole, stuck: whole.cycle })).toBeNull();
    const { cycle: _cycle, ...short } = whole;
    expect(readAutomationStudioTaskAttemptLoopsCaught(short)).toBeNull();
    expect(readAutomationStudioTaskAttemptLoopsCaught({ ...whole, cycle: { ...whole.cycle, retried: 1 } })).toBeNull();
    expect(readAutomationStudioTaskAttemptLoopsCaught({ ...whole, cycle: { ...whole.cycle, steered: 1.5 } })).toBeNull();
    expect(readAutomationStudioTaskAttemptLoopsCaught({ ...whole, cycle: { ...whole.cycle, steered: -1 } })).toBeNull();
    expect(readAutomationStudioTaskAttemptLoopsCaught(null)).toBeNull();
  });
});
