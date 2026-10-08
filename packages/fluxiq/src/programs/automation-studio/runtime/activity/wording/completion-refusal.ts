/**
 * Why a proposed Flow was refused, by the tail of each refusal code the check
 * gives (`flow_bootstrap.evidence_completion_<tail>`): plain words, no code.
 */
const BECAUSE: Readonly<Record<string, string>> = Object.freeze({
  wrapper_invalid: "the answer wasn't in the shape a finished Flow needs",
  plan_invalid: "some steps weren't written in a way the Flow can run",
  profile_limit_exceeded: "the Flow is bigger than it is allowed to be",
  parameters_unresolved: "some steps point at things that weren't seen on the page",
  cannot_answer: "it doesn't yet do everything that was asked",
  cannot_reach_start: "it can't get from where it starts to the page it needs"
});

/**
 * Why the test of the Flow refused a completion the check had passed, by the
 * test's own issue code (`../../flow-draft/full-run-required.ts`,
 * `../../flow-draft/dry-run.ts`). Live run `run-musp39u8-9ac026ab` (R3c) showed
 * three completions refused `full_run_required` as "Checking the Flow is
 * finished" and said nothing of the refusal.
 */
const TEST_BECAUSE: Readonly<Record<string, string>> = Object.freeze({
  "llm_evidence_loop.full_run_required": "some of its steps haven't run in this build, so the whole Flow can't be tested from its start yet",
  "llm_evidence_loop.dry_run_refused": "its test run from the start didn't go through"
});

const FALLBACK = "It needs changes before it can be used, and it goes back to be fixed.";

/** The refusal codes the check's feedback names (its `refusals` and `refusal`). */
function refusalCodes(feedback: unknown): string[] {
  const named = feedback && typeof feedback === "object" && !Array.isArray(feedback) ? feedback as { refusal?: unknown; refusals?: unknown } : {};
  return [...(Array.isArray(named.refusals) ? named.refusals : []), named.refusal].filter((code): code is string => typeof code === "string");
}

/**
 * Each known reason the check's feedback names, once each, in plain words;
 * nothing for feedback that names none. The check that refuses a legacy
 * build's completion also refuses a candidate build's submitted steps
 * (`../../llm/harness-options/bootstrap-completion.ts`), so both read these
 * words (`../candidate/submission-words.ts`, t373).
 */
export function automationStudioActivityCheckRefusalReasons(feedback: unknown): string[] {
  return [...new Set(refusalCodes(feedback).map((code) => BECAUSE[code.split(".").at(-1)!.replace(/^evidence_completion_/u, "")]).filter((reason): reason is string => Boolean(reason)))];
}

/**
 * A refused completion, said in a person's words: which of Core's reasons
 * refused it (read from the check's feedback `refusal` and `refusals`, else
 * from the test's own issue codes) and how many things are to be fixed -- the
 * steps the test named, when it named any. Never an issue code; a refusal whose
 * codes name no known reason reads as the plain fallback.
 */
export function automationStudioActivityCompletionRefusal(check: { issueCodes: readonly string[]; feedback?: unknown; steps?: readonly number[] | undefined }): string {
  const checked = automationStudioActivityCheckRefusalReasons(check.feedback);
  const tested = refusalCodes(check.feedback).length ? [] : check.issueCodes.map((code) => TEST_BECAUSE[code]);
  const reasons = [...new Set([...checked, ...tested].filter((reason): reason is string => Boolean(reason)))];
  const steps = check.steps?.length ?? 0;
  const count = steps || check.issueCodes.length;
  const noun = steps ? ["step needs", "steps need"] : ["thing needs", "things need"];
  const things = count > 1 ? ` ${count} ${noun[1]} fixing.` : count === 1 ? ` One ${noun[0]} fixing.` : "";
  if (!reasons.length) return `${FALLBACK}${things}`;
  const joined = reasons.length === 1 ? reasons[0]! : `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)!}`;
  return `Sent back because ${joined}.${things}`;
}
