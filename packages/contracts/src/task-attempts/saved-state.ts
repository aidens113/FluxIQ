// What an attempt left saved, for the chip beside its answer. A closed set read from
// Core, never guessed: the chip may only claim what is true. It carries ids, a closed
// set, times, a verdict and a digest of the steps: no page address, no page text, no token.
//
// **Trust is in the type.** `ready` means it worked last time, so a `ready` that is
// `unproven` cannot be written, and a draft that passed only in simulation stays
// `partly_works` and `unproven`, told as "checked against my recording, not yet run
// live". Attempt 1 always ends that way when it ends with a draft (plan, D4): only a
// later attempt's judged live run can make it `ready`.

import { hasOnlyKeys, isCount, isDigest, isId, isMemberOf, isPlainRecord } from "./field-checks.ts";
import { parseTotally } from "./parse-totally.ts";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS, type AutomationStudioTaskAttemptSimulationVerdict } from "./task-attempt.ts";
import { AUTOMATION_STUDIO_TRUST_TIERS, type AutomationStudioTrustTier } from "./trust.ts";

/**
 * - `ready`: a saved Flow that worked in a judged live run.
 * - `partly_works`: saved steps it will repair or try live next time.
 * - `notes_only`: no steps could be saved, only what it learned.
 * - `needs_you`: it stopped at something only a person can do.
 */
export const AUTOMATION_STUDIO_SAVED_STATES = Object.freeze(["ready", "partly_works", "notes_only", "needs_you"] as const);

export type AutomationStudioSavedStateName = (typeof AUTOMATION_STUDIO_SAVED_STATES)[number];

export type AutomationStudioSavedState =
  | { state: "ready"; trust: Exclude<AutomationStudioTrustTier, "unproven">; flowId: string; savedAtMs: number; lastWorkedAtMs: number; stepsDigest?: string }
  | { state: "partly_works"; trust: Exclude<AutomationStudioTrustTier, "established">; flowId: string; savedAtMs: number; simulation?: AutomationStudioTaskAttemptSimulationVerdict; stepsDigest?: string }
  | { state: "notes_only"; trust: "unproven"; savedAtMs: number }
  | { state: "needs_you"; trust: AutomationStudioTrustTier; flowId?: string; savedAtMs: number };

export type AutomationStudioSavedStateParseResult =
  | { ok: true; saved: AutomationStudioSavedState }
  | { ok: false; issues: string[] };

const KEYS_BY_STATE: Readonly<Record<AutomationStudioSavedStateName, ReadonlySet<string>>> = Object.freeze({
  ready: new Set(["state", "trust", "flowId", "savedAtMs", "lastWorkedAtMs", "stepsDigest"]),
  partly_works: new Set(["state", "trust", "flowId", "savedAtMs", "simulation", "stepsDigest"]),
  notes_only: new Set(["state", "trust", "savedAtMs"]),
  needs_you: new Set(["state", "trust", "flowId", "savedAtMs"])
});

/**
 * Parses an untrusted value into a saved state, returning fresh objects. Exact
 * fields per state: an unknown state, trust tier, verdict or key is refused. Also
 * refused: `ready` unproven, `partly_works` established, `notes_only` anything but
 * unproven. Issues are stable codes prefixed `saved_state.`, each listed once.
 */
export function parseAutomationStudioSavedState(value: unknown): AutomationStudioSavedStateParseResult {
  const parsed = parseTotally("saved_state", (issues) => readSaved(value, issues));
  return parsed.ok ? { ok: true, saved: parsed.value } : parsed;
}

function readSaved(value: unknown, issues: Set<string>): AutomationStudioSavedState | null {
  if (!isPlainRecord(value)) {
    issues.add("saved_state.not_object");
    return null;
  }
  const { state, trust, flowId, savedAtMs, lastWorkedAtMs, simulation, stepsDigest } = value;
  if (!isMemberOf(AUTOMATION_STUDIO_SAVED_STATES, state)) {
    issues.add("saved_state.invalid_state");
    return null;
  }
  if (!hasOnlyKeys(value, KEYS_BY_STATE[state])) issues.add("saved_state.unknown_key");
  if (!isMemberOf(AUTOMATION_STUDIO_TRUST_TIERS, trust)) issues.add("saved_state.invalid_trust");
  if (!isCount(savedAtMs)) issues.add("saved_state.invalid_saved_at");
  if (flowId !== undefined && !isId(flowId)) issues.add("saved_state.invalid_flow_id");
  if ((state === "ready" || state === "partly_works") && flowId === undefined) issues.add("saved_state.needs_flow");
  if (stepsDigest !== undefined && !isDigest(stepsDigest)) issues.add("saved_state.invalid_steps_digest");
  if (issues.size > 0 || !isMemberOf(AUTOMATION_STUDIO_TRUST_TIERS, trust) || !isCount(savedAtMs)) return null;
  if (state === "ready") {
    if (trust === "unproven") issues.add("saved_state.ready_needs_proof");
    if (!isCount(lastWorkedAtMs)) issues.add("saved_state.invalid_last_worked_at");
    if (issues.size > 0 || trust === "unproven" || !isId(flowId) || !isCount(lastWorkedAtMs)) return null;
    return { state, trust, flowId, savedAtMs, lastWorkedAtMs, ...(isDigest(stepsDigest) ? { stepsDigest } : {}) };
  }
  if (state === "partly_works") {
    if (trust === "established") issues.add("saved_state.partly_works_not_established");
    if (simulation !== undefined && !isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS, simulation)) issues.add("saved_state.invalid_simulation");
    if (issues.size > 0 || trust === "established" || !isId(flowId)) return null;
    return { state, trust, flowId, savedAtMs, ...(isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS, simulation) ? { simulation } : {}), ...(isDigest(stepsDigest) ? { stepsDigest } : {}) };
  }
  if (state === "notes_only") {
    if (trust !== "unproven") {
      issues.add("saved_state.notes_only_is_unproven");
      return null;
    }
    return { state, trust, savedAtMs };
  }
  return isId(flowId) ? { state, trust, flowId, savedAtMs } : { state, trust, savedAtMs };
}
