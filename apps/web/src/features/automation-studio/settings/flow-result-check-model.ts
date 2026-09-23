// Training checks, as the Flow settings view reads and writes them.
//
// Its own module rather than five more fields in `flow-settings-model.ts`,
// which is at its exported-value budget and is already the widest thing in this
// directory. Everything here is about one question -- which of a Flow's runs
// have their results judged, and how that reads in plain English -- so it is
// also where the question belongs.
//
// The numbers mirror Core's `AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS` exactly,
// and `flowResultCheckPreviewOrdinals` mirrors Core's
// `automationStudioResultCheckOrdinals`. A Core test pins the default's
// ordinals (1, 2, 3, 8, 33, 158) literally and a test here asserts the same
// sentence, so the two cannot drift silently.

/** The training-check half of a Flow settings draft. Strings, because they come from number inputs. */
export type FlowResultCheckDraft = {
  resultCheckEnabled: boolean;
  resultCheckShape: "initial_then_exponential" | "linear_decay" | "fixed_interval" | "every_run" | "never";
  resultCheckInitialRunCount: string;
  resultCheckInterval: string;
  resultCheckDecay: string;
  /** Empty means no ceiling, which is the default and is the schedule the user asked for. */
  resultCheckMaxInterval: string;
  resultCheckRepairOnRefutation: boolean;
};

export const FLOW_RESULT_CHECK_DEFAULT_VALUES = {
  resultCheckShape: "initial_then_exponential",
  resultCheckInitialRunCount: "3",
  resultCheckInterval: "5",
  resultCheckDecay: "5",
  resultCheckMaxInterval: ""
} satisfies Partial<FlowResultCheckDraft>;

/**
 * The controls as the stored settings describe them.
 *
 * A Flow with nothing stored comes back showing the defaults it is already
 * running under, not a blank form: Core gives every Flow the default schedule
 * with no migration, and a settings view showing "off" for a Flow that is in
 * fact being checked would be lying about what the Flow does.
 */
export function flowResultCheckDraftFromSettings(stored: any): FlowResultCheckDraft {
  const schedule = stored && typeof stored === "object" && stored.schedule && typeof stored.schedule === "object" ? stored.schedule : {};
  const shapes = ["initial_then_exponential", "linear_decay", "fixed_interval", "every_run", "never"];
  return {
    resultCheckEnabled: typeof schedule.enabled === "boolean" ? schedule.enabled : true,
    resultCheckShape: shapes.includes(schedule.shape) ? schedule.shape : "initial_then_exponential",
    resultCheckInitialRunCount: numberField(schedule.initialRunCount, 3),
    resultCheckInterval: numberField(schedule.interval, 5),
    resultCheckDecay: numberField(schedule.decay, 5),
    resultCheckMaxInterval: schedule.maxInterval === undefined || schedule.maxInterval === null ? "" : numberField(schedule.maxInterval, 1),
    resultCheckRepairOnRefutation: typeof schedule.repairOnRefutation === "boolean" ? schedule.repairOnRefutation : true
  };
}

/** The schedule as Core stores it. Written whole rather than as a diff from the defaults: it is one small object, and a partial one reads as "nobody said". */
export function flowResultCheckSchedule(draft: FlowResultCheckDraft) {
  const ceiling = draft.resultCheckMaxInterval.trim();
  return {
    enabled: draft.resultCheckEnabled,
    shape: draft.resultCheckShape,
    initialRunCount: Number(draft.resultCheckInitialRunCount),
    interval: Number(draft.resultCheckInterval),
    decay: Number(draft.resultCheckDecay),
    ...(ceiling ? { maxInterval: Number(ceiling) } : {}),
    repairOnRefutation: draft.resultCheckRepairOnRefutation
  };
}

/**
 * What the person must fix before these settings can be saved.
 *
 * Only checked when checking is on: a Flow with it turned off keeps whatever
 * numbers it had, and refusing a save over a field nothing reads would be a
 * wall in front of turning it off.
 */
export function flowResultCheckErrors(draft: FlowResultCheckDraft): string[] {
  if (!draft.resultCheckEnabled) return [];
  const errors: string[] = [];
  const initial = Number(draft.resultCheckInitialRunCount);
  const interval = Number(draft.resultCheckInterval);
  const decay = Number(draft.resultCheckDecay);
  if (!Number.isInteger(initial) || initial < 0) errors.push("Runs checked to begin with must be a whole number, zero or more.");
  if (!Number.isInteger(interval) || interval < 1) errors.push("Checking every Nth run needs a whole number of at least 1.");
  if (!Number.isFinite(decay) || decay < 1) errors.push("The widening factor must be at least 1; 1 means the interval never widens.");
  if (draft.resultCheckMaxInterval.trim()) {
    const ceiling = Number(draft.resultCheckMaxInterval);
    if (!Number.isInteger(ceiling) || ceiling < 1) errors.push("The longest gap between checks must be a whole number of at least 1.");
    else if (Number.isInteger(interval) && ceiling < interval) errors.push("The longest gap between checks cannot be shorter than the first interval.");
  }
  return errors;
}

/**
 * What this schedule will actually do, said back to the person.
 *
 * The copy says **runs**, never days, and deliberately. Nothing in Core
 * schedules a Flow: every run is started by something outside it, so "the 33rd
 * run" may be next week or next year, and a line promising a check "in a month"
 * would be a line Core cannot keep.
 */
export function flowResultCheckSummary(draft: FlowResultCheckDraft): string {
  if (!draft.resultCheckEnabled || draft.resultCheckShape === "never") return "Results are not checked. A run that finishes without a failed step is reported as a success whether or not it answered what you asked for.";
  if (draft.resultCheckShape === "every_run") return "Every run's result is checked.";
  // The bound only decides how many ordinals are worth printing. Every shape
  // but `never` goes on checking forever, so the sentence always says so.
  const checked = flowResultCheckPreviewOrdinals(draft, 100_000);
  if (!checked.length) return "No run falls due for a check under these numbers.";
  return `Runs ${checked.slice(0, 6).join(", ")} and so on have their results checked.`;
}

/** The run ordinals this schedule checks, up to a bound. Mirrors Core's `automationStudioResultCheckOrdinals`. */
function flowResultCheckPreviewOrdinals(draft: FlowResultCheckDraft, bound: number): number[] {
  const initial = Math.max(0, Math.trunc(Number(draft.resultCheckInitialRunCount) || 0));
  const interval = Math.max(1, Math.trunc(Number(draft.resultCheckInterval) || 1));
  const decay = Math.max(1, Math.trunc(Number(draft.resultCheckDecay) || 1));
  const ceilingValue = Number(draft.resultCheckMaxInterval);
  const ceiling = draft.resultCheckMaxInterval.trim() && Number.isFinite(ceilingValue) ? Math.max(1, Math.trunc(ceilingValue)) : Number.MAX_SAFE_INTEGER;
  const checked: number[] = [];
  for (let ordinal = 1; ordinal <= Math.min(initial, bound); ordinal += 1) checked.push(ordinal);
  let cursor = initial;
  for (let widenings = 0; ; widenings += 1) {
    const widened = draft.resultCheckShape === "linear_decay" ? interval + decay * widenings : draft.resultCheckShape === "fixed_interval" ? interval : interval * decay ** widenings;
    const next = cursor + Math.min(ceiling, Math.max(1, widened));
    if (next > bound) return checked;
    checked.push(next);
    cursor = next;
  }
}

function numberField(value: unknown, fallback: number): string {
  const parsed = Number(value);
  return String(Number.isFinite(parsed) ? parsed : fallback);
}
