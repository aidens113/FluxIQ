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

const FALLBACK = "It needs changes before it can be used, and it goes back to be fixed.";

/**
 * A refused completion check, said in a person's words: which of Core's
 * reasons refused it (read from the feedback's `refusal` and `refusals`) and
 * how many things are to be fixed. Never an issue code; a refusal whose codes
 * name no known reason reads as the plain fallback.
 */
export function automationStudioActivityCompletionRefusal(check: { issueCodes: readonly string[]; feedback?: unknown }): string {
  const feedback = check.feedback && typeof check.feedback === "object" && !Array.isArray(check.feedback) ? check.feedback as { refusal?: unknown; refusals?: unknown } : {};
  const codes = [...(Array.isArray(feedback.refusals) ? feedback.refusals : []), feedback.refusal].filter((code): code is string => typeof code === "string");
  const reasons = [...new Set(codes.map((code) => BECAUSE[code.split(".").at(-1)!.replace(/^evidence_completion_/u, "")]).filter((reason): reason is string => Boolean(reason)))];
  const count = check.issueCodes.length;
  const things = count > 1 ? ` ${count} things need fixing.` : count === 1 ? " One thing needs fixing." : "";
  if (!reasons.length) return `${FALLBACK}${things}`;
  const joined = reasons.length === 1 ? reasons[0]! : `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)!}`;
  return `Sent back because ${joined}.${things}`;
}
