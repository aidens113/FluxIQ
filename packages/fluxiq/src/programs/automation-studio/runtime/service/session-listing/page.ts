// One listing page from the summaries a reader fetched in listing order: the
// reader asks for one more than the limit, and that extra row is what says a
// further page exists, so `nextCursor` is never offered onto an empty page.

import type { AutomationStudioRuntimeRunSummary, AutomationStudioRuntimeRunSummaryPage } from "../../../storage/index.ts";
import { encodeAutomationStudioRuntimeSessionCursor } from "./cursor.ts";
import type { AutomationStudioRuntimeSessionListingFilter } from "./filter.ts";

export function automationStudioRuntimeSummaryPage(fetched: readonly AutomationStudioRuntimeRunSummary[], filter: AutomationStudioRuntimeSessionListingFilter, total: number): AutomationStudioRuntimeRunSummaryPage {
  const runs = fetched.slice(0, filter.limit);
  const last = runs.at(-1);
  const nextCursor = fetched.length > filter.limit && last ? encodeAutomationStudioRuntimeSessionCursor({ queuedAt: last.queuedAt ?? 0, runId: last.runId }) : null;
  return { runs, total, limit: filter.limit, offset: filter.offset, nextCursor };
}
