import { automationStudioActivityRecordedCheck } from "../../automation-activity/step/index.ts";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder, type AutomationStudioLlmStepLogFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";

const OUTCOME_WORDS: Readonly<Record<string, string>> = {
  kept_no: "the earlier answer of no was kept",
  kept_failed: "the earlier failure was kept",
  passed: "it passed",
  gap: "the recording has no match",
  inconclusive: "it was inconclusive",
  not_tried: "it was not tried"
};

/** A gap's reason, its cause or an action type: a plain code, never page text. */
const GAP_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/u;
/** Where a command differed: a field path, never what it held. */
const GAP_FIELD = /^[A-Za-z0-9_$.-]{1,120}$/u;
const MAX_GAP_FIELDS = 20;

/**
 * What an offline trial's `describe` says of its answer: codes and counts only.
 * Any other field of the object is dropped, so no trace id, run id, page text or
 * typed value can reach the step.
 */
export type AutomationStudioLlmStepLogOfflineTrialOutcome = {
  /** `kept_no`, `kept_failed`, `passed`, `gap`, `inconclusive`, `not_tried`, or `refused:<code>`. */
  outcome: string;
  /** The step number a `gap` stopped at. */
  step?: number;
  matchedOperations?: number;
  recordedOperations?: number;
  /** The gap the check stopped at, whatever its outcome: why it was inconclusive. Codes, counts and field paths only. */
  gap?: { code: string; cause: string; ordinal: number; action: string; fields: readonly string[]; step?: number };
};

/**
 * `run`, timed as one `NNNN-offline` step: a build's test call first checked
 * against a recorded run instead of the site (trace plan P6). The folder holds
 * `meta.json` alone -- kind `offline_trial`, `trialToolId`, the scope's part,
 * round, phase and agent, `status` (`ok` or `threw`), `outcome` (whitelisted
 * code), `gapStep`, `gap` (the reason's code and cause, the command's place and
 * action type, the differing field paths), the operation counts and a plain-words
 * `summary`. Never the trace, its id, a run id, page data or a typed value. `run` itself, with no
 * step, when the step log is off.
 *
 * Either way `run` runs as a check against the recorded run
 * (`../../activity/step/recorded-check.ts`, t769 b13): every gate wraps its
 * offline check here, and that check runs the Flow's steps through Core's
 * executor, whose rows otherwise read as the build testing its Flow on the
 * site. Marked, they say they are checked against the recorded run.
 */
export async function automationStudioLlmStepLogOfflineTrial<T>(
  meta: { trialToolId: string },
  run: () => Promise<T>,
  describe: (answer: T) => AutomationStudioLlmStepLogOfflineTrialOutcome,
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<T> {
  const check = () => automationStudioActivityRecordedCheck.run(run);
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return await check();
  const step = offlineStep(directory, meta.trialToolId);
  let answer: T;
  try {
    answer = await check();
  } catch (error) {
    step?.(undefined, error);
    throw error;
  }
  let described: AutomationStudioLlmStepLogOfflineTrialOutcome | undefined;
  try {
    described = describe(answer);
  } catch {
    /* best-effort: a description that cannot be made never fails the trial */
  }
  step?.(described, undefined);
  return answer;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function outcomeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (Object.hasOwn(OUTCOME_WORDS, value)) return value;
  return /^refused:[A-Za-z0-9_.-]{1,60}$/u.test(value) ? value : null;
}

function wording(outcome: string | null, gapStep: number | null, gapCode: string | null): string {
  const lead = "Checked against the recorded run (not the site): ";
  if (outcome === null) return `${lead}no outcome`;
  if (outcome.startsWith("refused:")) return `${lead}refused (${outcome.slice("refused:".length)})`;
  const words = OUTCOME_WORDS[outcome] ?? outcome;
  if (outcome === "gap" && gapStep !== null) return `${lead}${words} at step ${gapStep}`;
  if (outcome === "inconclusive" && gapCode !== null) return `${lead}${words} (${gapCode}${gapStep === null ? "" : ` at step ${gapStep}`})`;
  return `${lead}${words}`;
}

/** The gap as the step keeps it, each part whitelisted; a description carrying anything else has that part dropped. */
function gapOf(value: unknown): { code: string; cause: string | null; ordinal: number | null; action: string | null; fields: readonly string[]; step: number | null } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { code, cause, ordinal, action, fields, step } = value as Readonly<Record<string, unknown>>;
  if (typeof code !== "string" || !GAP_CODE.test(code)) return null;
  const paths = Array.isArray(fields) ? fields.filter((path): path is string => typeof path === "string" && GAP_FIELD.test(path)).slice(0, MAX_GAP_FIELDS) : [];
  return {
    code,
    cause: typeof cause === "string" && GAP_CODE.test(cause) ? cause : null,
    ordinal: count(ordinal),
    action: typeof action === "string" && GAP_CODE.test(action) ? action : null,
    fields: paths,
    step: count(step)
  };
}

function offlineStep(directory: string, trialToolId: string): ((described: AutomationStudioLlmStepLogOfflineTrialOutcome | undefined, error: unknown) => void) | undefined {
  const scope = automationStudioLlmStepLogScope.current();
  let folder: AutomationStudioLlmStepLogFolder;
  try {
    folder = automationStudioLlmStepLogOpenFolder(directory, "offline");
  } catch (error) {
    // The disk refused the folder: no step, never a failed trial.
    if (automationStudioLlmStepLogFolderRefused(error)) return undefined;
    throw error;
  }
  const started = Date.now();
  return (described, error) => {
    try {
      const finished = Date.now();
      const outcome = error === undefined ? outcomeCode(described?.outcome) : null;
      const gap = error === undefined ? gapOf(described?.gap) : null;
      const gapStep = error === undefined ? count(described?.step) ?? gap?.step ?? null : null;
      const summary = error === undefined ? wording(outcome, gapStep, gap?.code ?? null) : "Checked against the recorded run (not the site): it stopped with an error";
      automationStudioLlmStepLogWriter(folder.path).meta({
        step: folder.step, kind: "offline_trial", trialToolId, callId: null, toolId: null,
        startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(), ms: finished - started,
        part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? automationStudioLlmStepLogNaming.phaseOfKind("offline_trial"),
        role: scope?.role ?? null, briefId: scope?.briefId ?? null,
        status: error === undefined ? "ok" : "threw", outcome, gapStep,
        gap: gap === null ? null : { code: gap.code, cause: gap.cause, ordinal: gap.ordinal, action: gap.action, fields: gap.fields },
        matchedOperations: error === undefined ? count(described?.matchedOperations) : null,
        recordedOperations: error === undefined ? count(described?.recordedOperations) : null,
        summary
      });
      automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "offline_trial", tool: undefined, summary, costUsd: undefined, role: scope?.role, briefId: scope?.briefId });
    } catch {
      /* best-effort: a step that cannot be finished never fails the trial */
    }
  };
}
