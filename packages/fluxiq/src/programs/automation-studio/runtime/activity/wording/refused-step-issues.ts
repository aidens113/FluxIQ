import type { AutomationStudioActivityIssue } from "./issue-words.ts";

/**
 * `issues` with each one's step words from `steps` -- a failed build's
 * `refusedSteps` (`../../flow-bootstrap/generation-failure/refused-steps.ts`,
 * t378), read here by shape -- where one is placed where the issue is: the
 * same script line, else the same path; or, for an issue that names no place
 * (its code travelled without the plan path, too long to fit), the next step
 * refused for the same code, whose place it then takes, so it reads as that
 * step. An issue that already has words, or that no step matches, is left as
 * it came; anything in `steps` not of that shape is ignored. The words are
 * still screened where they are said (`./issue-words.ts`).
 */
export function automationStudioActivityRefusedStepIssues(issues: readonly AutomationStudioActivityIssue[], steps: unknown): AutomationStudioActivityIssue[] {
  const placed = (Array.isArray(steps) ? steps : []).flatMap((entry) => {
    const step = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as { step?: unknown; line?: unknown; path?: unknown; code?: unknown } : undefined;
    return typeof step?.step === "string" && step.step.trim()
      ? [{ step: step.step, line: typeof step.line === "number" ? step.line : undefined, path: typeof step.path === "string" ? step.path : undefined, code: typeof step.code === "string" ? step.code : undefined }]
      : [];
  });
  const unplacedTaken = new Set<number>();
  return issues.map((issue) => {
    if (issue.step !== undefined) return { ...issue };
    if (typeof issue.line === "number") {
      const match = placed.find((step) => step.line === issue.line);
      return match ? { ...issue, step: match.step } : { ...issue };
    }
    if (issue.path !== undefined) {
      const match = placed.find((step) => step.path === issue.path);
      return match ? { ...issue, step: match.step } : { ...issue };
    }
    const code = issue.code.split(":")[0];
    const index = placed.findIndex((step, at) => !unplacedTaken.has(at) && step.code === code);
    if (index < 0) return { ...issue };
    unplacedTaken.add(index);
    const match = placed[index]!;
    return { ...issue, step: match.step, ...(match.line !== undefined ? { line: match.line } : match.path !== undefined ? { path: match.path } : {}) };
  });
}
