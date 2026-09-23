// What the person chose about having results checked, and the defaults a Flow
// that has never been configured runs under.
//
// The user's own schedule, in his words, is "the first 3 runs after creation,
// then decaying -- about every 5th, then the 25th, and so on exponentially".
// That is read here as *the interval decays geometrically*: three back to back,
// then every 5th run, then every 25th, then every 125th. With the defaults
// below the checked ordinals are 1, 2, 3, 8, 33, 158, 783 -- five checks in a
// Flow's first fifty runs.
//
// Checking is on by default, and deliberately so. A Flow that is never checked
// is the state FluxIQ was already in on 2026-09-17, when four live runs each
// reported success while returning the wrong thing; the default schedule costs
// about $0.0074 over fifty runs, which is under a tenth of building the Flow
// once. A person who does not want it turns it off, which is one setting.

/**
 * How the interval between checks changes as a Flow keeps working.
 *
 * `initial_then_exponential` is the default and is the user's stated schedule.
 * The other four exist so the policy is genuinely replaceable rather than one
 * curve with knobs: a Flow run twice a year wants `every_run`, a Flow whose
 * result is checked by something else wants `never`, and a regulated one wants
 * a `fixed_interval` that never widens.
 */
export type AutomationStudioResultCheckShape =
  | "initial_then_exponential"
  | "linear_decay"
  | "fixed_interval"
  | "every_run"
  | "never";

export type AutomationStudioResultCheckSettings = {
  enabled: boolean;
  shape: AutomationStudioResultCheckShape;
  /** Runs checked back to back after creation, or after the Flow's graph changed. */
  initialRunCount: number;
  /** The first interval once the initial window has passed. */
  interval: number;
  /** How the interval widens: multiplied by this (exponential) or added to (linear). */
  decay: number;
  /** A ceiling on the widened interval, so a long-lived Flow is still checked. Unset by default. */
  maxInterval?: number;
  /** Whether a refutation opens the repair entry. */
  repairOnRefutation: boolean;
};

/** What a Flow nobody has configured checks on. Every existing Flow reads these without a migration. */
export const AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS: Readonly<AutomationStudioResultCheckSettings> = Object.freeze({
  enabled: true,
  shape: "initial_then_exponential",
  initialRunCount: 3,
  interval: 5,
  decay: 5,
  repairOnRefutation: true
});

/**
 * A shape name read from stored settings, or the default.
 *
 * An unrecognised shape resolves to the default rather than to `never`, the
 * same fail-closed reading `trainingModeValue` applies: a settings file written
 * by a newer build, or corrupted, must not silently stop a Flow being checked.
 */
export function automationStudioResultCheckShapeValue(value: unknown): AutomationStudioResultCheckShape {
  if (value === "initial_then_exponential" || value === "linear_decay" || value === "fixed_interval" || value === "every_run" || value === "never") return value;
  return AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS.shape;
}
