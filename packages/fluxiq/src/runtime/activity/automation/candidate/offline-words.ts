/**
 * A build's test that was checked against the recording of the build's last
 * live test first (trace plan P6), in a person's words: `live` is what the
 * test said without that (`./trial-words.ts`), this says which part of it was
 * the recording. The evidence carries either `checkedAgainst: "recorded_run"`
 * (the test ran only against the recording and failed there; the site was not
 * touched) or `offlineCheck` (the recording was checked first, then the Flow ran
 * on the site). Never a revision, a digest, a run id, a trace id or a code
 * (t362): the check's reason is quoted only when it reads as a sentence.
 *
 * Nothing changes for evidence with neither, and an offline result never reads
 * as "the test passed": the recorded run is named before the verdict.
 */

/** The most of the check's reason a card quotes. */
const MAX_WHY = 80;
/** A reason written as a code (`trace.operation_changed`) or carrying an id, which no person reads. */
const CODE_LIKE = /[_.]|[0-9a-f]{16,}|\d{3,}/iu;

const objectOf = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);

/** The check's reason as a short lower-case phrase, or nothing when it is a code or too long. */
function reasonOf(why: unknown): string | undefined {
  if (typeof why !== "string") return undefined;
  const text = why.trim().replace(/\.$/u, "");
  if (!text || text.length > MAX_WHY || CODE_LIKE.test(text)) return undefined;
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

export function automationStudioActivityCandidateOfflineWords(evidence: Record<string, unknown>, live: string): string {
  if (evidence.checkedAgainst === "recorded_run") return `checked against the recorded run, not the site: ${live}`;
  const check = objectOf(evidence.offlineCheck);
  if (check?.outcome === "passed") return `it passed against the recorded run, then on the site: ${live}`;
  if (check?.outcome === "gap") {
    const reason = reasonOf(check.why);
    const step = typeof check.step === "number" && Number.isSafeInteger(check.step) ? `step ${check.step}` : "a step";
    return `the recorded run couldn't answer ${step}${reason ? ` (${reason})` : ""}, so it was tested on the site: ${live}`;
  }
  if (check?.outcome === "inconclusive") return `the recorded run couldn't settle it, so it was tested on the site: ${live}`;
  return live;
}
