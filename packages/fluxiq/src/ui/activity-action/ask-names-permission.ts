/**
 * The title the ask row carries (`runtime/automation-activity/ask/title.ts`):
 * "Asked a question (permission)", the ask's own kind in brackets.
 */
const ASKED = /^Asked a question \(([^()]+)\)$/u;

/**
 * Whether an ask row is a permission request rather than some other question
 * (a text question, a choice, a yes or no). The row says which in the ask kind
 * its title carries, never in the question's words. A row whose title names no
 * ask kind at all stays a permission, as it always was.
 */
export function activityActionAskNamesPermission(title: string): boolean {
  const kind = ASKED.exec(title)?.[1];
  return kind === undefined || kind === "permission";
}
