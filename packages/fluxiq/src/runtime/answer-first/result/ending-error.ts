/**
 * An attempt's ending that contradicts itself: a programming error in whoever wrote
 * it, never an ending of a task. A task ends only with its result, its budget gone or
 * a person's Stop (the user's hard rule, 2026-11-03), and this says Core tried to
 * write something else. `issues` are the contracts' stable codes.
 */
export class AutomationStudioAnswerFirstEndingError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`An attempt's ending does not hold together: ${issues.join(", ")}.`);
    this.name = "AutomationStudioAnswerFirstEndingError";
    this.issues = [...issues];
  }
}
