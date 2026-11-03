import type { AutomationStudioActivityIssue } from "./issue-words.ts";

/** The issues a refusal's feedback names (`issues`), read by shape, with each one's step words where it has them; codes without a place are kept by code. */
export function automationStudioActivityIssuesOf(feedback: unknown): AutomationStudioActivityIssue[] {
  const issues = feedback && typeof feedback === "object" && !Array.isArray(feedback) ? (feedback as { issues?: unknown }).issues : undefined;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    const named = issue && typeof issue === "object" && !Array.isArray(issue) ? issue as { code?: unknown; path?: unknown; line?: unknown; step?: unknown } : undefined;
    if (typeof named?.code !== "string" || !named.code) return [];
    return [{
      code: named.code, ...(typeof named.path === "string" ? { path: named.path } : {}), ...(typeof named.line === "number" ? { line: named.line } : {}),
      ...(typeof named.step === "string" && named.step.trim() ? { step: named.step } : {})
    }];
  });
}
