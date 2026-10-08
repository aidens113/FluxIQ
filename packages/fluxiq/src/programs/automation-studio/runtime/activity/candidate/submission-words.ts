import { automationStudioActivityCheckRefusalReasons } from "../wording/index.ts";

/**
 * How a candidate build's submission of its Flow's steps ended
 * (`core.submit_candidate`, `../../flow-bootstrap/candidate/authoring-loop.ts`),
 * in a person's words, read from the evidence Core answered it with: accepted,
 * or declined with what to fix. Never a revision, a digest, an issue code or a
 * handle: the evidence names all of them, and the person sees none (t362).
 *
 * The check that refuses a submission is the one that refuses a legacy build's
 * completion, so its reasons read the same (`../wording/completion-refusal.ts`). Two
 * refusals are the candidate's own: a repeat or a bound value the Flow cannot
 * run (`candidate.loop_or_binding_refused`, `../../flow-bootstrap/candidate/submission.ts`),
 * and newer steps sent while these were checked (`candidate.superseded_submission`).
 */

/** Refusals of the candidate's own, by the code its diagnostics or issue codes carry. */
const OWN: Readonly<Record<string, string>> = Object.freeze({
  "candidate.loop_or_binding_refused": "a repeat, or a value that changes as the Flow runs, wasn't written in a way the Flow can run",
  "candidate.superseded_submission": "newer steps were sent while these were being checked"
});
const FALLBACK = "some steps weren't written in a way the Flow can run";
const ACCEPTED = "the steps were accepted";

const objectOf = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);

/** Accepted (`Said`), or declined with why and how many things are to be fixed (`Declined`); nothing for evidence of another shape. */
export function automationStudioActivityCandidateSubmissionWords(evidence: unknown): { declined: boolean; words: string } | undefined {
  const answer = objectOf(evidence);
  if (answer?.ok === true) return { declined: false, words: ACCEPTED };
  if (answer?.ok !== false) return undefined;
  const diagnostics = objectOf(answer.diagnostics) ?? {};
  const issueCodes = Array.isArray(answer.issueCodes) ? answer.issueCodes.filter((code): code is string => typeof code === "string") : [];
  const own = [diagnostics.code, ...issueCodes].map((code) => (typeof code === "string" ? OWN[code] : undefined)).filter((words): words is string => words !== undefined);
  const reasons = [...new Set([...automationStudioActivityCheckRefusalReasons(diagnostics), ...own])];
  const because = reasons.length === 0 ? FALLBACK : reasons.length === 1 ? reasons[0]! : `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)!}`;
  const issues = Array.isArray(diagnostics.issues) ? diagnostics.issues.length : issueCodes.length;
  const count = issues > 1 ? `; ${issues} things to fix` : "";
  return { declined: true, words: `${because}${count}` };
}
