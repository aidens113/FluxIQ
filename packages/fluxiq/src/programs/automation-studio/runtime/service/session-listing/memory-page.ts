// The same listing for a service with no data directory, whose sessions live
// only in memory: the summaries are filtered, ordered and cut here, in the
// order and with the cursor the SQL reader uses (`sql-page.ts`).

import type { AutomationStudioRuntimeRunSummary, AutomationStudioRuntimeRunSummaryPage } from "../../../storage/index.ts";
import type { AutomationStudioRuntimeSessionListingFilter } from "./filter.ts";
import { automationStudioRuntimeSummaryPage } from "./page.ts";

export function listAutomationStudioRuntimeSummaryMemoryPage(summaries: readonly AutomationStudioRuntimeRunSummary[], filter: AutomationStudioRuntimeSessionListingFilter): AutomationStudioRuntimeRunSummaryPage {
  const runIds = filter.runIds ? new Set(filter.runIds) : null, statuses = filter.statuses ? new Set(filter.statuses) : null;
  const matching = summaries.filter((summary) =>
    (filter.flowId === undefined || summary.flowId === filter.flowId)
    && (filter.candidateId === undefined || summary.candidateTrial?.candidateId === filter.candidateId)
    && (!runIds || runIds.has(summary.runId))
    && (!statuses || statuses.has(summary.status))
  ).sort(newestQueuedFirst);
  const cursor = filter.cursor;
  const after = cursor ? matching.filter((summary) => (summary.queuedAt ?? 0) < cursor.queuedAt || ((summary.queuedAt ?? 0) === cursor.queuedAt && summary.runId < cursor.runId)) : matching;
  return automationStudioRuntimeSummaryPage(after.slice(filter.offset, filter.offset + filter.limit + 1), filter, matching.length);
}

function newestQueuedFirst(left: AutomationStudioRuntimeRunSummary, right: AutomationStudioRuntimeRunSummary): number {
  const byQueued = (right.queuedAt ?? 0) - (left.queuedAt ?? 0);
  if (byQueued !== 0) return byQueued;
  return left.runId < right.runId ? 1 : left.runId > right.runId ? -1 : 0;
}
