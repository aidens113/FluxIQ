import { automationStudioActivityHumanLabel } from "../wording/index.ts";

/**
 * How a candidate build's test of its Flow ended (`core.test_candidate`,
 * `../../flow-bootstrap/candidate/trial-gate.ts`), in a person's words: the
 * trial's verdict and what each step did, read from the feedback the trial
 * gate answered with (`../../service/candidate-trial/feedback.ts`: steps
 * folded per step since t365, a failed check's awaited text since t368), or why
 * the gate would not run the test at all. Never a revision, a digest, a run id,
 * a node id or a code (t362): a step is named by its number in the run, the
 * words of the control it acted on (screened by the domain before they left
 * the browser), else the label written for it.
 *
 * `failed` is true for every verdict but yes: the card of a test the judge
 * refused, could not confirm or could not run must not read "Done". `declined`
 * is true when the gate ran nothing.
 */

/** Why the gate ran nothing, by its refusal code. */
const NOT_RUN: Readonly<Record<string, string>> = Object.freeze({
  "candidate.trial_input_invalid": "only the latest saved steps can be tested",
  "candidate.trial_stale_revision": "only the latest saved steps can be tested",
  "candidate.trial_unavailable": "no test can run here, so the Flow is kept as an untested draft",
  "candidate.trial_unchanged_after_no": "these exact steps already failed the test, so they have to change first",
  "candidate.trial_same_failure": "these steps stopped at the same step twice, so that step has to change first",
  "candidate.trial_retest_limit": "these steps were already tested as often as they may be, so they have to change first"
});
const NOT_RUN_FALLBACK = "the test couldn't start";

/** A failed run that never reached a step, by the gate's or the runner's code. */
const NO_STEP: Readonly<Record<string, string>> = Object.freeze({
  "candidate.trial_port_failed": "the test couldn't run the Flow",
  "candidate.trial_result_invalid": "the test's answer couldn't be read",
  "candidate.trial_result_mismatch": "the test answered about other steps than these"
});

/** The most steps a card names beside its counts. */
const MAX_NAMED = 2;
/** The most of a control's words or a step's label a card quotes. */
const MAX_NAME = 40;
/** A control handle as a view prints it (`t478`), which a label the model wrote may carry. */
const HANDLE = /^\(?[a-z]\d{2,}\)?[,.;:]?$/u;

type Step = { step?: unknown; label?: unknown; control?: unknown; status?: unknown; skipped?: unknown; happened?: unknown; waitedFor?: unknown; textPresence?: unknown };

const objectOf = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);
const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
const sentence = (text: unknown): string | undefined => (typeof text === "string" && text.trim() ? lowerFirst(text.trim().replace(/\.$/u, "")) : undefined);
const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** `step 4, “Add to cart”,`: its number in the run and, set off by commas, the words it acted on, where it has them. */
function named(step: Step): string {
  const number = typeof step.step === "number" && Number.isSafeInteger(step.step) ? `step ${step.step}` : "a step";
  // A label is the model's, and may carry the handle it copied from a view ("Add to cart t478"); a handle is no word a person reads.
  const label = typeof step.label === "string" ? step.label.split(/\s+/u).filter((word) => !HANDLE.test(word)).join(" ") : undefined;
  const name = automationStudioActivityHumanLabel(step.control, MAX_NAME) ?? automationStudioActivityHumanLabel(label, MAX_NAME);
  return name ? `${number}, “${name}”,` : number;
}

/** What went wrong at a failed step: what a failed check waited for and whether the page had it, else Core's sentence for the failure. */
function whyFailed(step: Step): string {
  const awaited = automationStudioActivityHumanLabel(step.waitedFor, MAX_NAME);
  if (awaited !== undefined) {
    if (step.textPresence === "hidden") return `“${awaited}” was on the page but stayed hidden`;
    if (step.textPresence === "absent") return `“${awaited}” wasn't on the page`;
    return `the page didn't show “${awaited}”`;
  }
  return sentence(step.happened) ?? "it didn't work";
}

/**
 * What the steps did: how many were done and skipped, and each step that did
 * not work (at most `MAX_NAMED`), named, with why; a failed step the run went
 * past (an optional one) says so.
 */
function stepsSaid(feedback: Record<string, unknown>): string | undefined {
  const steps: Step[] = Array.isArray(feedback.steps) ? feedback.steps.map(objectOf).filter((step): step is Record<string, unknown> => step !== undefined) : [];
  if (!steps.length) return undefined;
  const skipped = steps.filter((step) => step.skipped !== undefined).length;
  const done = steps.filter((step) => step.status === "succeeded" && step.skipped === undefined).length;
  const failed = steps.filter((step) => step.status === "failed");
  const counts = [done ? `${counted(done, "step", "steps")} done` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean).join(", ");
  const last = steps.at(-1);
  const said = failed.slice(0, MAX_NAMED).map((step) => `${named(step)} didn't work${step === last ? "" : " and was passed over"}: ${whyFailed(step)}`);
  const more = failed.length > MAX_NAMED ? [`${failed.length - MAX_NAMED} more didn't work`] : [];
  return [...said, ...more, counts].filter(Boolean).join("; ") || undefined;
}

/** The test's verdict and its steps in words, or why it ran nothing; nothing for an answer of another shape. */
export function automationStudioActivityCandidateTrialWords(result: { resultCode?: unknown; evidence?: unknown }): { failed: boolean; declined: boolean; words: string } | undefined {
  const evidence = objectOf(result.evidence);
  if (!evidence) return undefined;
  const verdict = evidence.verdict;
  if (typeof verdict !== "string") {
    if (evidence.ok !== false) return undefined;
    const code = typeof evidence.code === "string" ? evidence.code : typeof result.resultCode === "string" ? result.resultCode : "";
    return { failed: true, declined: true, words: NOT_RUN[code] ?? NOT_RUN_FALLBACK };
  }
  const feedback = objectOf(evidence.feedback) ?? {};
  const steps = stepsSaid(feedback);
  const after = (head: string): string => (steps ? `${head}: ${steps}` : head);
  if (verdict === "yes") return { failed: false, declined: false, words: after("the test passed and the Flow did what you asked") };
  if (verdict === "no") return { failed: true, declined: false, words: after("the Flow ran, but it didn't do what you asked") };
  if (verdict === "unsure" || verdict === "not_judged") return { failed: true, declined: false, words: after("the Flow ran, but whether it did what you asked couldn't be confirmed") };
  const code = typeof feedback.code === "string" ? feedback.code : "";
  // A run that stopped between steps names no failed step: its counts alone would read as the reason.
  const anyFailed = Array.isArray(feedback.steps) && feedback.steps.some((step) => objectOf(step)?.status === "failed");
  const stopped = steps === undefined ? NO_STEP[code] ?? "the Flow didn't get to its first step" : anyFailed ? steps : `the Flow stopped before its end: ${steps}`;
  return { failed: true, declined: false, words: evidence.failedStep !== undefined ? `${stopped}; it stopped there in two tests, so that step has to change` : stopped };
}
