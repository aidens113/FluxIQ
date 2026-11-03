// What a candidate build that stopped for no progress last had refused, as
// codes its failure can carry (t378).
//
// **Why.** Lanes C and D (`run-mv0fuotv-805294d7`, `run-mv0fuual-f9e6f089`)
// ended "it kept trying without getting any further": the Flow the model wrote
// had been refused -- a repeat written in the wrong place; a step that keeps
// only some rows written three wrong ways -- and in lane C sent again unchanged
// three times. None of that reached the ending, because a build's failure
// carries codes, never a sentence (`../../flow-bootstrap/generation-failure/diagnostic.ts`),
// and the stall's own codes are the loop's (`llm_evidence_loop.repeat_refused`).
//
// So the last refused submission travels in the failure's `issueCodes`, first,
// as codes: how many submissions in a row were refused, how many times the
// last was sent again unchanged, and each of its issues' codes with the step
// it is about. The chat reads them back with `decode` and says the cause in
// plain words (`../../conversations/commands/progress.ts`). Producer and reader
// share this one table, as every other field of that diagnostic does.

/** One issue of the refused submission: its code, and its script line or path. */
type Issue = { code: string; line?: number | undefined; path?: string | undefined };
/** What the codes carry: `family` is the refusal's own code (`flow_bootstrap.evidence_completion_plan_invalid`), said when no issue has words of its own. */
type Refusal = { refusals: number; sentAgain: number; family?: string | undefined; issues: Issue[] };

const REFUSED = "candidate.last_submission_refused";
const SENT_AGAIN = "candidate.last_submission_sent_again";
const ISSUE = "candidate.last_submission_issue";
const FAMILY = "candidate.last_submission_family";
/** The shape a diagnostic's issue code must have (`flowBootstrapDiagnosticIssueCodes`). */
const CODE = /^[a-z0-9_.:-]{1,100}$/iu;
/** The most issues carried, so the loop's own codes still fit in the diagnostic's sixteen. */
const MAX_ISSUES = 10;
const COUNT = /^\d{1,4}$/u;

function encodeIssue(issue: Issue): string | undefined {
  const code = issue.code.split(":")[0]!;
  const place = typeof issue.line === "number" && Number.isSafeInteger(issue.line) && issue.line >= 0 ? `line.${issue.line}` : issue.path;
  const placed = place ? `${ISSUE}:${code}:${place}` : undefined;
  if (placed && CODE.test(placed)) return placed;
  const bare = `${ISSUE}:${code}`;
  return CODE.test(bare) ? bare : undefined;
}

function decodeIssue(code: string): Issue | undefined {
  const [, issue, ...rest] = code.split(":");
  if (!issue) return undefined;
  const place = rest.join(":");
  const line = /^line\.(\d+)$/u.exec(place)?.[1];
  return { code: issue, ...(line !== undefined ? { line: Number(line) } : place ? { path: place } : {}) };
}

export const automationStudioCandidateRefusalCodes = Object.freeze({
  /** The codes for a build whose last submission was refused; none when it was not. */
  encode(refusal: Refusal): string[] {
    if (refusal.refusals < 1) return [];
    const issues = refusal.issues.map(encodeIssue).filter((code): code is string => code !== undefined);
    const family = refusal.family === undefined ? undefined : `${FAMILY}:${refusal.family}`;
    return [
      `${REFUSED}:${Math.min(refusal.refusals, 9999)}`,
      ...(refusal.sentAgain > 0 ? [`${SENT_AGAIN}:${Math.min(refusal.sentAgain, 9999)}`] : []),
      ...(family !== undefined && CODE.test(family) ? [family] : []),
      ...[...new Set(issues)].slice(0, MAX_ISSUES)
    ];
  },
  /** What `codes` say of the last refused submission, or `undefined` when they say none. */
  decode(codes: readonly unknown[]): Refusal | undefined {
    const strings = codes.filter((code): code is string => typeof code === "string");
    const count = (prefix: string): number => {
      const value = strings.find((code) => code.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
      return value !== undefined && COUNT.test(value) ? Number(value) : 0;
    };
    const refusals = count(REFUSED);
    if (refusals < 1) return undefined;
    const issues = strings.filter((code) => code.startsWith(`${ISSUE}:`)).map(decodeIssue).filter((issue): issue is Issue => issue !== undefined);
    const family = strings.find((code) => code.startsWith(`${FAMILY}:`))?.slice(FAMILY.length + 1);
    return { refusals, sentAgain: count(SENT_AGAIN), ...(family ? { family } : {}), issues };
  }
});
