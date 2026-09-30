import type { ResolvedProblemsHostState } from "./problem-host";
import type { AutomationProblemSeverity, AutomationProblemViewItem } from "./problem-model";

// "Report problem" on the Problems view: a diagnostic bundle a person can attach
// to a problem report, the Core-side half of the browser extension's own report
// (`background/diagnostics/` in the web extension).
//
// Built by allowlist. A problem is reported by its code, severity, blocking flag
// and the ids of what it is about -- enough to find the same problem in the same
// project again -- and never by its label, message or scope label: those are
// prose a validator wrote, and prose quotes what it validated, which can be a
// value a person typed into a Flow. Names of Flows and artifacts are left out for
// the same reason. `withheld` says so, so a reader can tell "absent by design"
// from "lost".

export const PROBLEM_REPORT_LIMIT = 200;

export const PROBLEM_REPORT_WITHHELD = [
  "problem labels and messages",
  "Flow, subflow and artifact names",
  "run inputs, outputs, traces and recorded page data",
  "credentials, tokens and cookies"
] as const;

export type CoreProblemReport = {
  schema: "fluxiq.core-problem-report/1";
  createdAt: string;
  fluxiqVersion?: string;
  browser: { name: string; version?: string };
  projectId: string | null;
  currentObjectId: string | null;
  validation: { status: ResolvedProblemsHostState["status"]; validatedAt: number | null };
  counts: Record<AutomationProblemSeverity, number>;
  problems: Array<{ code: string; severity: AutomationProblemSeverity; blocking: boolean; scopeIds: string[] }>;
  truncated: boolean;
  withheld: string[];
};

export type CoreProblemReportInput = {
  readonly now: number;
  readonly fluxiqVersion?: string | undefined;
  readonly userAgent: string;
  readonly projectId?: string | null | undefined;
  readonly hostState: Pick<ResolvedProblemsHostState, "status" | "currentObject">;
  readonly validatedAt?: number | null | undefined;
  readonly problems: readonly AutomationProblemViewItem[];
  readonly truncated: boolean;
};

export function buildCoreProblemReport(input: CoreProblemReportInput): CoreProblemReport {
  const counts: Record<AutomationProblemSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const problem of input.problems) counts[problem.severity] += 1;
  return {
    schema: "fluxiq.core-problem-report/1",
    createdAt: new Date(input.now).toISOString(),
    ...(input.fluxiqVersion ? { fluxiqVersion: input.fluxiqVersion } : {}),
    browser: browserIdentity(input.userAgent),
    projectId: input.projectId ?? null,
    currentObjectId: input.hostState.currentObject?.id ?? null,
    validation: { status: input.hostState.status, validatedAt: input.validatedAt ?? null },
    counts,
    problems: input.problems.slice(0, PROBLEM_REPORT_LIMIT).map((problem) => ({
      code: problem.code,
      severity: problem.severity,
      blocking: problem.blocking,
      scopeIds: [...problem.scopeIds]
    })),
    truncated: input.truncated || input.problems.length > PROBLEM_REPORT_LIMIT,
    withheld: [...PROBLEM_REPORT_WITHHELD]
  };
}

/** The browser's name and major version, without the rest of the user agent. */
export function browserIdentity(userAgent: string): { name: string; version?: string } {
  const patterns: Array<[string, RegExp]> = [
    ["Edge", /\bEdg\/(\d+)/u],
    ["Opera", /\bOPR\/(\d+)/u],
    ["Firefox", /\bFirefox\/(\d+)/u],
    ["Chrome", /\bChrome\/(\d+)/u],
    ["Safari", /\bVersion\/(\d+).*\bSafari\//u]
  ];
  for (const [name, pattern] of patterns) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return { name, version };
  }
  return { name: "Unknown" };
}
