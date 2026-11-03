import { automationStudioActivityIssueWords } from "./issue-words.ts";
import { automationStudioActivityIssuesOf } from "./issues-of.ts";

/**
 * A refused Flow's reasons and how much is to be fixed, read from the check's
 * feedback (t378): the reasons its issues give in their own words
 * (`./issue-words.ts`), and how many steps they name -- distinct steps, so one
 * step refused for two reasons counts once ("4 things to fix" was 2 steps).
 * `steps` is false when some issue names no step, and the count is then of
 * things; with no issues at all it is the issue codes, also things. A reason
 * names its steps in the model's own words where the issues carry them. No
 * reason when the issues give none of their own: the caller then says the
 * refusal's family (`./completion-refusal.ts`).
 */
export function automationStudioActivityRefusalTally(feedback: unknown, issueCodes: readonly string[]): { reasons: string[]; count: number; steps: boolean } {
  const issues = automationStudioActivityIssuesOf(feedback);
  if (!issues.length) return { reasons: [], count: issueCodes.length, steps: false };
  const named = automationStudioActivityIssueWords(issues, false, true);
  return { reasons: named.reasons, count: named.steps + named.others, steps: named.others === 0 };
}
