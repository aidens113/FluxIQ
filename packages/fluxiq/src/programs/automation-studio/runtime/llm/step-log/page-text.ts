import type { AutomationStudioLlmEvidenceSummary } from "../../../nodes/index.ts";

/** Registered once per domain summary, by the implementation bundle (`AutomationStudioNativeNodeRuntime.register`). */
const summaries = new Set<AutomationStudioLlmEvidenceSummary>();

/**
 * The page text a step's evidence carries, as a registered domain reads it.
 * Core knows no page: what evidence means belongs to the domain that produced
 * it, and Core only writes the answer to `page.txt`. Process-wide, as the step
 * log's own switch is, because a tool step has no domain in hand. No summary
 * registered, or none that answers, means no `page.txt`.
 */
export const automationStudioLlmStepLogPageText = {
  of(evidence: unknown): string | undefined {
    for (const summary of summaries) {
      const page = summary.pageText(evidence);
      if (page !== undefined) return page;
    }
    return undefined;
  },
  /** Adds a domain's summary, and returns how to take it away again. */
  use(summary: AutomationStudioLlmEvidenceSummary): () => void {
    summaries.add(summary);
    return () => {
      summaries.delete(summary);
    };
  }
};
