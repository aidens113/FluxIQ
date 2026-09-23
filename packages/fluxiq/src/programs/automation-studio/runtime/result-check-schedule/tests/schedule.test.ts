import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RESULT_CHECK_CODES,
  AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS,
  automationStudioResultCheckOrdinals,
  decideAutomationStudioResultCheck,
  resolveAutomationStudioResultCheckSchedule,
  type AutomationStudioResultCheckSettings,
  type AutomationStudioResultCheckState
} from "../index.ts";

const settings = (overrides: Partial<AutomationStudioResultCheckSettings> = {}): AutomationStudioResultCheckSettings =>
  ({ ...AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS, ...overrides });

const state = (overrides: Partial<AutomationStudioResultCheckState> = {}): AutomationStudioResultCheckState =>
  ({ ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null, ...overrides });

/**
 * Every run from 1 to `runs`, replayed through the policy exactly as the
 * runtime would: the state carries what the previous checks actually said, so
 * a shape's ordinals come out of the decision and not out of the generator the
 * decision uses.
 */
function replay(input: {
  shape?: AutomationStudioResultCheckSettings["shape"];
  runs: number;
  settings?: Partial<AutomationStudioResultCheckSettings>;
  /** What a check at this ordinal returns. Anything unlisted confirms. */
  statuses?: Record<number, AutomationStudioResultCheckState["lastStatus"]>;
}): { checked: number[]; codes: Record<number, string> } {
  const resolved = settings({ ...(input.shape ? { shape: input.shape } : {}), ...input.settings });
  const schedule = resolveAutomationStudioResultCheckSchedule(resolved.shape);
  const checked: number[] = [];
  const codes: Record<number, string> = {};
  let lastCheckedOrdinal: number | null = null;
  let lastStatus: AutomationStudioResultCheckState["lastStatus"] = null;
  let checksPassed = 0;
  for (let ordinal = 1; ordinal <= input.runs; ordinal += 1) {
    const decision = schedule.decide({ state: { ordinal, lastCheckedOrdinal, checksPassed, lastStatus }, settings: resolved });
    codes[ordinal] = decision.code;
    if (!decision.check) continue;
    checked.push(ordinal);
    lastCheckedOrdinal = ordinal;
    lastStatus = input.statuses?.[ordinal] ?? "confirmed";
    if (lastStatus === "confirmed") checksPassed += 1;
  }
  return { checked, codes };
}

describe("result check schedule shapes", () => {
  it("checks exactly 1, 2, 3, 8, 33, 158 over 200 runs under the default shape", () => {
    expect(replay({ runs: 200 }).checked).toEqual([1, 2, 3, 8, 33, 158]);
  });

  it("checks 1, 2, 3, 8, 33, 158, 783 over 1000 runs under the default shape", () => {
    expect(replay({ runs: 1000 }).checked).toEqual([1, 2, 3, 8, 33, 158, 783]);
  });

  it("produces the tabulated ordinals for each of the other four shapes", () => {
    expect(replay({ shape: "linear_decay", runs: 60 }).checked).toEqual([1, 2, 3, 8, 18, 33, 53]);
    expect(replay({ shape: "fixed_interval", runs: 50 }).checked).toEqual([1, 2, 3, 8, 13, 18, 23, 28, 33, 38, 43, 48]);
    expect(replay({ shape: "every_run", runs: 50 }).checked).toEqual(Array.from({ length: 50 }, (_value, index) => index + 1));
    expect(replay({ shape: "never", runs: 50 }).checked).toEqual([]);
  });

  it("makes five checks in the first fifty runs under the default, against twelve and fifty", () => {
    expect(replay({ runs: 50 }).checked).toHaveLength(5);
    expect(replay({ shape: "fixed_interval", runs: 50 }).checked).toHaveLength(12);
    expect(replay({ shape: "every_run", runs: 50 }).checked).toHaveLength(50);
  });

  it("holds a widened interval to maxInterval when one is set", () => {
    expect(replay({ runs: 60, settings: { maxInterval: 10 } }).checked).toEqual([1, 2, 3, 8, 18, 28, 38, 48, 58]);
  });

  it("resolves an unrecognised shape to the default, never to never", () => {
    expect(resolveAutomationStudioResultCheckSchedule("time_based_quarterly").shape).toBe("initial_then_exponential");
    expect(resolveAutomationStudioResultCheckSchedule(undefined).shape).toBe("initial_then_exponential");
    expect(resolveAutomationStudioResultCheckSchedule(null).shape).toBe("initial_then_exponential");
    expect(resolveAutomationStudioResultCheckSchedule("never").shape).toBe("never");
  });
});

describe("result check schedule reset rules", () => {
  it("restarts the initial window when the epoch advances, because the ordinal restarts", () => {
    // A landed repair bumps the Flow's graph revision, which is the epoch, so
    // the counter reads 1 again and the first three runs are checked afresh.
    const schedule = resolveAutomationStudioResultCheckSchedule("initial_then_exponential");
    const resolved = settings();
    const afterRepair = [1, 2, 3, 4].map((ordinal) => schedule.decide({ state: state({ ordinal }), settings: resolved }));
    expect(afterRepair.map((decision) => decision.check)).toEqual([true, true, true, false]);
    expect(afterRepair[0]!.code).toBe(AUTOMATION_STUDIO_RESULT_CHECK_CODES.initialWindow);
    expect(afterRepair[3]!.code).toBe(AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalNotReached);
    expect(afterRepair[3]!.nextCheckAtOrdinal).toBe(8);
  });

  it("checks the run after a refutation, whatever the sequence says", () => {
    const decision = resolveAutomationStudioResultCheckSchedule("initial_then_exponential")
      .decide({ state: state({ ordinal: 9, lastCheckedOrdinal: 8, lastStatus: "refuted", checksPassed: 3 }), settings: settings() });
    expect(decision).toMatchObject({ check: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRefutation, nextCheckAtOrdinal: 33 });
  });

  it("asks once more after a scheduled check that settled nothing, and only once", () => {
    const schedule = resolveAutomationStudioResultCheckSchedule("initial_then_exponential");
    const reask = schedule.decide({ state: state({ ordinal: 9, lastCheckedOrdinal: 8, lastStatus: "unverified", checksPassed: 3 }), settings: settings() });
    expect(reask).toMatchObject({ check: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.reaskUnsettled });
    const again = schedule.decide({ state: state({ ordinal: 10, lastCheckedOrdinal: 9, lastStatus: "unverified", checksPassed: 3 }), settings: settings() });
    expect(again).toMatchObject({ check: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalNotReached });
  });

  it("does not let an unverified check become every-run checking", () => {
    const statuses: Record<number, AutomationStudioResultCheckState["lastStatus"]> = { 1: "unverified", 2: "unverified", 3: "unverified", 8: "unverified" };
    expect(replay({ runs: 40, statuses }).checked).toEqual([1, 2, 3, 4, 8, 9, 33].filter((ordinal) => ordinal <= 40));
  });

  it("counts an unverified check as neither a pass nor a refutation", () => {
    const replayed = replay({ runs: 12, statuses: { 8: "unverified" } });
    expect(replayed.codes[9]).toBe(AUTOMATION_STUDIO_RESULT_CHECK_CODES.reaskUnsettled);
    expect(replayed.codes[10]).toBe(AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalNotReached);
  });
});

describe("result check schedule refusals", () => {
  it("checks nothing when the person turned checking off, and says which of the two it was", () => {
    const off = resolveAutomationStudioResultCheckSchedule("initial_then_exponential")
      .decide({ state: state({ ordinal: 1 }), settings: settings({ enabled: false }) });
    expect(off).toMatchObject({ check: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.disabled, nextCheckAtOrdinal: null });
    const never = resolveAutomationStudioResultCheckSchedule("never").decide({ state: state({ ordinal: 1 }), settings: settings({ shape: "never" }) });
    expect(never).toMatchObject({ check: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.never, nextCheckAtOrdinal: null });
  });

  it("does not hang on settings that would make the interval zero", () => {
    expect(automationStudioResultCheckOrdinals(settings({ interval: 0, decay: 0 }), 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // No initial window at all: the first check falls at the interval itself,
    // and the second is already 25 runs further on.
    expect(automationStudioResultCheckOrdinals(settings({ initialRunCount: -4 }), 12)).toEqual([5]);
    expect(automationStudioResultCheckOrdinals(settings({ initialRunCount: -4 }), 40)).toEqual([5, 30]);
  });

  it("gives every decision a reason a person can read", () => {
    const schedule = resolveAutomationStudioResultCheckSchedule("initial_then_exponential");
    for (const ordinal of [1, 4, 8, 9]) {
      const decision = schedule.decide({ state: state({ ordinal, lastCheckedOrdinal: 3, lastStatus: "confirmed", checksPassed: 3 }), settings: settings() });
      expect(decision.reason.length).toBeGreaterThan(20);
      expect(decision.code.startsWith("core.check.")).toBe(true);
    }
  });
});
