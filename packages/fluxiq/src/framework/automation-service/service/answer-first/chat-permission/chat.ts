// What one chat holds of the person's answer about dangerous acts (t976): kept beside its Flow (`./store.ts`).

import type { AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";

/** What one chat holds. */
export type AutomationStudioAnswerFirstChatPermission = {
  /** The gated classes the person allowed in this chat. */
  granted: AutomationStudioActionConsequence[];
  /** The gated classes the person refused in this chat. */
  declined: AutomationStudioActionConsequence[];
  /** The request the person's latest no answered: what a refusal of a class they refused carries. */
  declinedRequestId: string | null;
  /** Consequences a runtime repair met after asking closed, considered at the next task start. */
  unforeseen: AutomationStudioActionConsequence[];
  /** Per instruction (a digest of its words), the gated classes it needs: its read's, and any a run met unforeseen. */
  needs: { instruction: string; classes: AutomationStudioActionConsequence[] }[];
};
