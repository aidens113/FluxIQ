// The note a judge asked again after an unreadable reply is shown (t979): what could not be read, in the case words a
// decision loop already tells its model, where the reply parted from the schema (t1000), and what to send instead.
// Where the same unreadable reply came back again, the steer for that loop follows (`./steer.ts`, t1000). Generic: no
// site, task or answer is named.
//
// **Last, so a cached prefix still holds.** It is set as the last member of the judge's copy of the summary, after
// everything a first ask sent, so the bytes before it are the first ask's. A judge continuing the decider's
// conversation sends its whole message after the decider's cached blocks
// (`../../models/providers/anthropic/continuation.ts`), so the note is after that prefix too.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

/** The judge's copy of `summary` with the note on what could not be read of its last reply (`said`), and the steer of a repeat (`steer`), last. */
export function automationStudioResultSummaryWithUnreadableNote<TSummary extends AutomationStudioRunResultSummary>(summary: TSummary, said: string, steer?: string): TSummary {
  const { unreadableReply: _earlier, ...rest } = summary;
  const unreadableReply = `Your last reply to this check could not be read: ${said}. Answer the same question again with exactly one JSON object of the outputSchema and nothing before or after it, every quote and backslash inside its strings escaped.${steer ? ` ${steer}` : ""}`;
  return { ...rest, unreadableReply } as TSummary;
}
