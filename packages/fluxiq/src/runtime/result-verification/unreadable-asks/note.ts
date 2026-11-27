// The note a judge asked again after an unreadable reply is shown (t979): what could not be read, in the case words a
// decision loop already tells its model, where the reply parted from the schema (t1000), and what to send instead.
// Where the same unreadable reply came back again, the steer for that loop follows (`./steer.ts`, t1000). Generic: no
// site, task or answer is named.
//
// **Last, so a cached prefix still holds.** It is set as the last member of the judge's copy of the summary, after
// everything a first ask sent, so the bytes before it are the first ask's. A judge continuing the decider's
// conversation sends its whole message after the decider's cached blocks
// (`../../models/providers/anthropic/continuation.ts`), so the note is after that prefix too.
//
// **With the pages a judge on its own request needs (t1067).** A judge that never continues the decider, and a continuing
// judge after a decider in the JSON-text transport (t979), are asked again on their own request, which holds no decider
// conversation and so no page: `run-mwy3btww-31d32e0d`'s standalone judges said unsure for want of what the page showed.
// So the page views kept beside the judge's summary (`../judge-evidence/page-views.ts`: the end view, the before view
// where a lasting act ran, within the page budget) go in here, just before the note, after everything the first ask sent.
// A continuing judge's reply answered in its own conversation (t1065) sends back the continuation and only this note
// (`../../models/providers/anthropic/judge-call-answered.ts`), so the pages are not sent twice there; only a continuation
// asked again with no reply held (`continues_the_decider_again`) carries them beside the decider's own.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { AutomationStudioJudgePageViews } from "../judge-evidence/index.ts";

/** The judge's copy of `summary` with the note on what could not be read of its last reply (`said`), and the steer of a repeat (`steer`), last, after the page views kept beside it (header). */
export function automationStudioResultSummaryWithUnreadableNote<TSummary extends AutomationStudioRunResultSummary>(summary: TSummary, said: string, steer?: string): TSummary {
  const { unreadableReply: _earlier, pageViews: _shown, ...rest } = summary as TSummary & { pageViews?: unknown };
  const pageViews = AutomationStudioJudgePageViews.of(summary);
  const unreadableReply = `Your last reply to this check could not be read: ${said}. Answer the same question again with exactly one JSON object of the outputSchema and nothing before or after it, every quote and backslash inside its strings escaped.${steer ? ` ${steer}` : ""}`;
  const noted = { ...rest, ...(pageViews === undefined ? {} : { pageViews }), unreadableReply } as TSummary;
  AutomationStudioJudgePageViews.keep(noted, pageViews);
  return noted;
}
