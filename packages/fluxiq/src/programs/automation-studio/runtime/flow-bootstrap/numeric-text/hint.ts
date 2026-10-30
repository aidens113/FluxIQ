// The one-time refusal of a `where` text test of numbers or dates by their characters (t800, P7), for
// the submission controller (`../candidate/submission.ts`).
//
// What counts is `./found.ts`. The first submission carrying such a test is refused
// `candidate.numeric_text_test` with Core's words naming the bound to write; the same test sent again
// is accepted, so it is a hint, never a block (`canMeet` stays true: a bound can always be written).
// The refusal carries Core's resend mark (t650), as t641's and t666's do, so the repeat guard runs the
// invited resend. A test of words is never refused.
import type { AutomationStudioLlmEvidenceResendInvitation } from "../../llm/repeat-guard/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission } from "../candidate/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowPlanNumericTextTests, type AutomationStudioNumericTextTest } from "./found.ts";

/** The code a submission testing numbers or dates by their characters is refused under, once (header). */
export const AUTOMATION_STUDIO_CANDIDATE_NUMERIC_TEXT_TEST_CODE = "candidate.numeric_text_test";

const NUMBER_BOUND = "write a number bound on the column instead (atLeast, atMost, greaterThan or lessThan with the number), which holds for every value the column takes, not only those on the page today";
const DATE_BOUND = "write a date bound on the column instead: atLeast: \"<the earliest date, as the page dates it>\" for \"since\" and \"on or after\", or within: \"<n> days\" for \"in the last n days\", which hold for every date, not only those on the page today";

/** One controller's refusals of such tests, each refused once. */
export class AutomationStudioCandidateNumericTextHint {
  private readonly given = new Set<string>();

  /** The refusal for `plan` where it carries a test not yet refused; nothing otherwise. Each found is refused this once. */
  hint(input: { plan: AutomationStudioFlowBootstrapPlan; standing: AutomationStudioFlowCandidate | undefined }): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] | undefined {
    const fresh = automationStudioFlowPlanNumericTextTests(input.plan).filter((found) => !this.given.has(keyOf(found)));
    if (!fresh.length) return undefined;
    for (const found of fresh) this.given.add(keyOf(found));
    const said = sentence(fresh);
    const code = AUTOMATION_STUDIO_CANDIDATE_NUMERIC_TEXT_TEST_CODE;
    return {
      ok: false,
      issueCodes: [code],
      feedback: {
        ok: false,
        code,
        resend: "accepted_once" satisfies AutomationStudioLlmEvidenceResendInvitation,
        ...(input.standing ? { standingRevision: { revision: input.standing.revision, digest: input.standing.digest } } : {}),
        numericTextTests: fresh.map((found) => ({ ...(found.field ? { column: found.field } : {}), test: found.test, pattern: found.pattern, bound: found.kind })),
        issues: [{ code, message: said, path: fresh.map(keyOf).sort().join(" | ") }],
        instruction: said
      }
    };
  }
}

function keyOf(found: AutomationStudioNumericTextTest): string {
  return `${found.field ?? ""}\n${found.test}\n${found.pattern}`;
}

function sentence(found: readonly AutomationStudioNumericTextTest[]): string {
  const each = found.map((one) => `${one.field ? `"${one.field}" ` : ""}${one.test} ${JSON.stringify(one.pattern)}`).join("; ");
  const numbers = found.some((one) => one.kind === "number");
  const dates = found.some((one) => one.kind === "date");
  const bound = [numbers ? `for a number, ${NUMBER_BOUND}` : "", dates ? `for a date, ${DATE_BOUND}` : ""].filter(Boolean).join("; and ");
  return `This condition tests ${numbers && dates ? "numbers and dates" : numbers ? "numbers" : "dates"} by their characters (${each}). A text test spells out the values on the page today; it cannot say a bound, and the next value outside the spelling is missed. If the request asks for a bound, ${bound}. If the text really is words, send the same condition again.`;
}
