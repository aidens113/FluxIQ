// The revision an unchanged submission's refusal named as standing, kept with
// the refusal's outcome so the same script sent again is answered with the
// call that comes next (`./candidate-feedback.ts`, t738).
//
// Office rerun round 2 (`run-mvgf04kw-310fc169`, brief-4 0128-0137, brief-5
// 0188-0197): `candidate.unchanged_submission` said "Revision 1 still stands
// and has not been tested: test it", the builder sent the identical script
// again, and the repeat guard told it to "submit the whole subflow again".
// It did, twice, and the brief ended without the one test that was its next
// call. The refusal names that revision and digest under its `diagnostics`
// (`../../flow-bootstrap/candidate/unchanged-submission.ts`), and whether the
// revision was tried (`lastTrial`); a refusal after a judge's no may instead
// name another revision still standing (`standingRevision`), which was tried.

/** The refusal codes of a submission that changed nothing (`../../flow-bootstrap/candidate/unchanged-submission.ts`), read as plain strings. */
const UNCHANGED_CODES: ReadonlySet<string> = new Set(["candidate.unchanged_submission", "candidate.unchanged_after_no"]);

/** The standing revision an unchanged refusal's answer named; nothing for any other answer, or one that named none. */
export function automationStudioLlmEvidenceUnchangedStanding(resultCode: string | undefined, answer: string | undefined): { revision: number; digest: string; tried?: true } | undefined {
  if (resultCode === undefined || !UNCHANGED_CODES.has(resultCode)) return undefined;
  const value = parsed(answer);
  if (!isObject(value)) return undefined;
  const said = isObject(value.diagnostics) ? value.diagnostics : value;
  const own = receipt(said);
  // Tried when the refusal carries its last trial, or the judge's no on it.
  if (own) return { ...own, ...(said.lastTrial !== undefined || said.judged !== undefined ? { tried: true as const } : {}) };
  const other = isObject(said.standingRevision) ? receipt(said.standingRevision) : undefined;
  return other ? { ...other, tried: true } : undefined;
}

function receipt(value: Record<string, unknown>): { revision: number; digest: string } | undefined {
  const { revision, digest } = value;
  return Number.isSafeInteger(revision) && typeof digest === "string" && /^[A-Za-z0-9]{1,128}$/u.test(digest) ? { revision: revision as number, digest } : undefined;
}

/** An answer read as JSON; nothing for an answer in plain words. */
function parsed(answer: string | undefined): unknown {
  if (answer === undefined) return undefined;
  try {
    return JSON.parse(answer);
  } catch (error) {
    // The one failure that means "not JSON": an answer in plain words. Anything else is rethrown.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
