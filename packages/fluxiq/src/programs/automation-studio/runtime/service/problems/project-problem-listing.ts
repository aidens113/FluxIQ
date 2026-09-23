import { automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "../../../storage/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioProblemPage } from "./contracts.ts";
import { baselineAutomationStudioProblems, problemSeverityRank } from "./listing.ts";

export type AutomationStudioProjectProblemListingPorts = {
  projects: AutomationStudioProjectStore;
};

/**
 * One page of a project's problems, filtered, ordered and cursor-paged. The
 * project is read first so an unknown project fails the listing rather than
 * answering with the framework baseline.
 */
export async function listAutomationStudioProjectProblems(ports: AutomationStudioProjectProblemListingPorts, input: { projectId: string; domainId?: string | null; severity?: string; source?: string; status?: string; scopeId?: string; search?: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioProblemPage> {
  await ports.projects.findProject(input.projectId);
  const severity = input.severity?.trim().toLowerCase() || "";
  const source = input.source?.trim().toLowerCase() || "";
  const requestedStatus = input.status?.trim().toLowerCase() || "open";
  if (severity && !["error", "warning", "info"].includes(severity)) throw new Error("Invalid problem severity filter.");
  if (!["open", "resolved", "all"].includes(requestedStatus)) throw new Error("Invalid problem status filter.");
  const status = requestedStatus === "all" ? "" : requestedStatus;
  const scopeId = input.scopeId?.trim() || "";
  const search = input.search?.trim().toLowerCase() || "";
  const limit = automationStudioPageLimit(input.limit, 100);
  const owner = `project-problems:${input.projectId}`;
  const filterHash = automationStudioFilterHash({ severity, source, status, scopeId, search });
  const cursor = decodeAutomationStudioPageCursor<{ rank: number; source: string; id: string }>(input.cursor, { owner, filterHash, validate: (values) => Number.isSafeInteger(values.rank) && typeof values.source === "string" && typeof values.id === "string" });
  const base = baselineAutomationStudioProblems().filter((problem) => {
    const problemSource = String(problem.artifactKind ?? "framework").toLowerCase();
    const problemStatus = String((problem as any).status ?? "open").toLowerCase();
    const problemScope = String(problem.artifactId ?? "");
    const text = [problem.id, problem.message, problem.artifactKind, problem.artifactId].join(" ").toLowerCase();
    return (!source || problemSource === source) && (!status || problemStatus === status)
      && (!scopeId || problemScope === scopeId) && (!search || text.includes(search));
  });
  const all = base.filter((problem) => !severity || problem.severity === severity).sort((left, right) => problemSeverityRank(left.severity) - problemSeverityRank(right.severity)
    || String(left.artifactKind ?? "framework").localeCompare(String(right.artifactKind ?? "framework"))
    || left.id.localeCompare(right.id));
  const after = cursor ? all.filter((problem) => {
    const rank = problemSeverityRank(problem.severity);
    const problemSource = String(problem.artifactKind ?? "framework");
    return rank > cursor.rank || rank === cursor.rank && (problemSource > cursor.source || problemSource === cursor.source && problem.id > cursor.id);
  }) : all;
  const problems = after.slice(0, limit);
  const last = problems.at(-1);
  const counts = {
    error: base.filter((problem) => problem.severity === "error").length,
    warning: base.filter((problem) => problem.severity === "warning").length,
    info: base.filter((problem) => problem.severity === "info").length
  };
  return {
    problems,
    total: all.length,
    counts,
    limit,
    hasMore: after.length > limit,
    nextCursor: after.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { rank: problemSeverityRank(last.severity), source: String(last.artifactKind ?? "framework"), id: last.id } }) : null
  };
}
