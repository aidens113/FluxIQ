// One try at a task: the attempt row of the plan (D8, D11). Every attempt, first or
// fiftieth, is the same five stages, and this is what they report. It holds ids,
// counts, money and closed codes. Nothing here may carry a page address, page text
// or a token.

import { hasOnlyKeys, isAmount, isCount, isId, isMemberOf, isPlainRecord } from "./field-checks.ts";
import { parseTotally } from "./parse-totally.ts";
import { readAutomationStudioTaskAttemptLoopsCaught, type AutomationStudioTaskAttemptLoopsCaught } from "./loops-caught.ts";

/**
 * How an attempt went at the task. `explore` is one live exploration. The others
 * run the saved Flow, judged: `run_flow` when it held, `run_flow_then_repair` when
 * a failing step was repaired live from the page it left, and
 * `run_flow_then_explore` when exploration carried on from there (plan, D5).
 */
export const AUTOMATION_STUDIO_TASK_ATTEMPT_PATHS = Object.freeze(["explore", "run_flow", "run_flow_then_repair", "run_flow_then_explore"] as const);

export type AutomationStudioTaskAttemptPath = (typeof AUTOMATION_STUDIO_TASK_ATTEMPT_PATHS)[number];

/**
 * Where an attempt stands. **This list is closed on purpose and holds no `failed`.**
 * The user's hard rule (2026-11-03): a task ends only with its result, or with its
 * budget gone, or with a person stopping it. Nothing else may end one, so nothing
 * else can be said here, and a parser refuses any other word. A stall, a refused
 * call or a judge's no is a step inside `working`, and never a status.
 *
 * - `working`: it is spending, or about to.
 * - `waiting_for_person`: it waits with its remaining budget, and says for what
 *   (`waitingFor`). Not an ending: it resumes.
 * - `achieved`: its result was judged achieved. The only status that claims it.
 * - `budget_out`: its budget is gone, an empty balance included. The one failure
 *   ending there is, and it still carries what it got (`./task-result.ts`).
 * - `stopped_by_person`: a person pressed Stop. A person's Stop always wins.
 *
 * What an attempt and its result must say to each other is
 * `checkAutomationStudioTaskAttemptResult` (`./attempt-result-check.ts`).
 */
export const AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES = Object.freeze(["working", "waiting_for_person", "achieved", "budget_out", "stopped_by_person"] as const);

export type AutomationStudioTaskAttemptStatus = (typeof AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES)[number];

/**
 * What a `waiting_for_person` attempt waits for.
 *
 * - `permission`: a dangerous act needs a press of Allow (plan, D13).
 * - `person_only_check`: something only a person can do on the page.
 * - `stuck_in_a_loop`: fresh approaches looped too, so it stopped spending and asked
 *   (plan, D14's last step). It keeps the best result so far and the draft.
 */
export const AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS = Object.freeze(["permission", "person_only_check", "stuck_in_a_loop"] as const);

export type AutomationStudioTaskAttemptWaitReason = (typeof AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS)[number];

/**
 * What simulation said of the draft against this attempt's recording. `passed` means
 * the logic fits the recording, and nothing more: a person is told "checked against
 * my recording, not yet run live". It never proves a Flow (`./trust.ts`).
 */
export const AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS = Object.freeze(["passed", "failed", "inconclusive", "not_run"] as const);

export type AutomationStudioTaskAttemptSimulationVerdict = (typeof AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS)[number];

export type AutomationStudioTaskAttemptSimulation = {
  verdict: AutomationStudioTaskAttemptSimulationVerdict;
  /** Steps flagged to be tried live next time. A flag blocks nothing and is shown. */
  flags: number;
};

/** What the attempt has spent so far, on model calls and on the clock. */
export type AutomationStudioTaskAttemptSpend = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  ms: number;
};

/** What every attempt holds, whatever its status. */
export type AutomationStudioTaskAttemptFields = {
  /** The task across its attempts. */
  taskId: string;
  attemptId: string;
  /** Which attempt at the task, from 1. */
  ordinal: number;
  projectId: string;
  /** The Flow it ran or wrote. Required on a path that runs one. */
  flowId?: string;
  /** Its run, once it has one. */
  runId?: string;
  path: AutomationStudioTaskAttemptPath;
  spend: AutomationStudioTaskAttemptSpend;
  /** The attempt's one purse. Raised by "add budget and carry on". */
  budget: { usd: number };
  /** Live steps it took on the real site. */
  liveSteps: number;
  simulation?: AutomationStudioTaskAttemptSimulation;
  loopsCaught: AutomationStudioTaskAttemptLoopsCaught;
  /** Epoch milliseconds. */
  startedAtMs: number;
  /** Epoch milliseconds. Set on an ending, and absent while it can still go on. */
  endedAtMs?: number;
};

/** Tagged by status, so a `waiting_for_person` with no reason cannot be written, and a reason on any other status cannot either. */
export type AutomationStudioTaskAttempt = AutomationStudioTaskAttemptFields & (
  | { status: Exclude<AutomationStudioTaskAttemptStatus, "waiting_for_person"> }
  | { status: "waiting_for_person"; waitingFor: AutomationStudioTaskAttemptWaitReason }
);

export type AutomationStudioTaskAttemptParseResult =
  | { ok: true; attempt: AutomationStudioTaskAttempt }
  | { ok: false; issues: string[] };

const ATTEMPT_KEYS: ReadonlySet<string> = new Set(["taskId", "attemptId", "ordinal", "projectId", "flowId", "runId", "path", "status", "waitingFor", "spend", "budget", "liveSteps", "simulation", "loopsCaught", "startedAtMs", "endedAtMs"]);
const SPEND_KEYS: ReadonlySet<string> = new Set(["calls", "inputTokens", "outputTokens", "usd", "ms"]);
const BUDGET_KEYS: ReadonlySet<string> = new Set(["usd"]);
const SIMULATION_KEYS: ReadonlySet<string> = new Set(["verdict", "flags"]);
const ENDINGS: ReadonlySet<AutomationStudioTaskAttemptStatus> = new Set(["achieved", "budget_out", "stopped_by_person"]);

/**
 * Parses an untrusted value into an attempt, returning fresh objects. Exact fields:
 * an unknown key, path, status, wait reason, simulation verdict or loop pattern is
 * refused. Also refused: `waiting_for_person` with no reason, a reason on any other
 * status, a path that runs a Flow with no `flowId`, an ending with no `endedAtMs`, an
 * `endedAtMs` on an attempt that can still go on, an end before its start, and flags
 * on a simulation that did not run. Issues are stable codes prefixed `task_attempt.`,
 * each listed once.
 */
export function parseAutomationStudioTaskAttempt(value: unknown): AutomationStudioTaskAttemptParseResult {
  const parsed = parseTotally("task_attempt", (issues) => readAttempt(value, issues));
  return parsed.ok ? { ok: true, attempt: parsed.value } : parsed;
}

function readAttempt(value: unknown, issues: Set<string>): AutomationStudioTaskAttempt | null {
  if (!isPlainRecord(value)) {
    issues.add("task_attempt.not_object");
    return null;
  }
  if (!hasOnlyKeys(value, ATTEMPT_KEYS)) issues.add("task_attempt.unknown_key");
  const { taskId, attemptId, ordinal, projectId, flowId, runId, path, status, waitingFor, liveSteps, startedAtMs, endedAtMs } = value;
  const spend = readSpend(value.spend);
  const budget = readBudget(value.budget);
  const loopsCaught = readAutomationStudioTaskAttemptLoopsCaught(value.loopsCaught);
  const simulation = value.simulation === undefined ? undefined : readSimulation(value.simulation);
  if (!isId(taskId)) issues.add("task_attempt.invalid_task_id");
  if (!isId(attemptId)) issues.add("task_attempt.invalid_attempt_id");
  if (!isCount(ordinal) || ordinal < 1) issues.add("task_attempt.invalid_ordinal");
  if (!isId(projectId)) issues.add("task_attempt.invalid_project_id");
  if (flowId !== undefined && !isId(flowId)) issues.add("task_attempt.invalid_flow_id");
  if (runId !== undefined && !isId(runId)) issues.add("task_attempt.invalid_run_id");
  if (!isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_PATHS, path)) issues.add("task_attempt.invalid_path");
  else if (path !== "explore" && flowId === undefined) issues.add("task_attempt.flow_path_needs_flow");
  if (!isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES, status)) issues.add("task_attempt.invalid_status");
  if (status === "waiting_for_person") {
    if (waitingFor === undefined) issues.add("task_attempt.waiting_needs_reason");
    else if (!isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS, waitingFor)) issues.add("task_attempt.invalid_waiting_for");
  } else if (waitingFor !== undefined) issues.add("task_attempt.reason_without_waiting");
  if (spend === null) issues.add("task_attempt.invalid_spend");
  if (budget === null) issues.add("task_attempt.invalid_budget");
  if (!isCount(liveSteps)) issues.add("task_attempt.invalid_live_steps");
  if (simulation === null) issues.add("task_attempt.invalid_simulation");
  if (loopsCaught === null) issues.add("task_attempt.invalid_loops_caught");
  if (!isCount(startedAtMs)) issues.add("task_attempt.invalid_started_at");
  if (endedAtMs !== undefined && !isCount(endedAtMs)) issues.add("task_attempt.invalid_ended_at");
  if (isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES, status)) {
    if (ENDINGS.has(status) && endedAtMs === undefined) issues.add("task_attempt.ending_needs_ended_at");
    if (!ENDINGS.has(status) && endedAtMs !== undefined) issues.add("task_attempt.ended_at_before_ending");
  }
  if (isCount(startedAtMs) && isCount(endedAtMs) && endedAtMs < startedAtMs) issues.add("task_attempt.ended_before_started");
  if (issues.size > 0) return null;
  if (!isId(taskId) || !isId(attemptId) || !isCount(ordinal) || !isId(projectId) || !isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_PATHS, path) || !isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES, status)) return null;
  if (spend === null || budget === null || !isCount(liveSteps) || simulation === null || loopsCaught === null || !isCount(startedAtMs)) return null;
  const fields: AutomationStudioTaskAttemptFields = { taskId, attemptId, ordinal, projectId, path, spend, budget, liveSteps, loopsCaught, startedAtMs };
  if (typeof flowId === "string") fields.flowId = flowId;
  if (typeof runId === "string") fields.runId = runId;
  if (simulation !== undefined) fields.simulation = simulation;
  if (isCount(endedAtMs)) fields.endedAtMs = endedAtMs;
  if (status !== "waiting_for_person") return { ...fields, status };
  return isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS, waitingFor) ? { ...fields, status, waitingFor } : null;
}

function readSimulation(value: unknown): AutomationStudioTaskAttemptSimulation | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, SIMULATION_KEYS)) return null;
  const { verdict, flags } = value;
  if (!isMemberOf(AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS, verdict) || !isCount(flags)) return null;
  if (verdict === "not_run" && flags > 0) return null;
  return { verdict, flags };
}

function readSpend(value: unknown): AutomationStudioTaskAttemptSpend | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, SPEND_KEYS)) return null;
  const { calls, inputTokens, outputTokens, usd, ms } = value;
  if (!isCount(calls) || !isCount(inputTokens) || !isCount(outputTokens) || !isAmount(usd) || !isCount(ms)) return null;
  return { calls, inputTokens, outputTokens, usd, ms };
}

function readBudget(value: unknown): { usd: number } | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, BUDGET_KEYS) || !isAmount(value.usd)) return null;
  return { usd: value.usd };
}
