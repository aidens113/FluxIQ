// What one evidence decision is shown of everything the loop has gathered:
// all of it, in the order it happened.
//
// This module used to choose. It held each request to a byte allowance
// (24,000 bytes for Flow creation) and an entry count, kept the newest result
// of each tool first, then filled what was left newest first, and skipped a
// whole entry that did not fit without saying so. A page the model had
// observed early was gone by the decision that wrote the Flow, and nothing
// told it so. The standing decision of 2026-09-30 is that the model is shown
// every entry in full, with no ranking and no byte or count limit: the only
// bound on a request is the model's context window, and a request over it
// fails loudly before it is sent, with its measured size
// (`./harness/run.ts`, `./deepseek/provider.ts`). Nothing is trimmed to fit.
//
// A Core note superseded by a newer one of the same kind still leaves the
// evidence (`./decision-context/supersede.ts`); a tool's result never does.

import type { JsonValue } from "../../../../core/index.ts";

/** One evidence entry as a decision is shown it, and as the loop holds it. */
export type AutomationStudioLlmEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

/**
 * The evidence one decision is shown: every entry the loop holds, whole, in
 * the order the loop holds them.
 */
export function automationStudioLlmEvidenceContextWindow(records: readonly AutomationStudioLlmEvidenceEntry[]): AutomationStudioLlmEvidenceEntry[] {
  return records.map(({ callId, toolId, value }) => ({ callId, toolId, value }));
}
