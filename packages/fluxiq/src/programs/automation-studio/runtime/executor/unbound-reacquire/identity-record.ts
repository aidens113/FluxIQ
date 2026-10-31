import type { AutomationStudioIdentityReacquireReason } from "./identity-reason.ts";

/** A source-less recovery's closed trace record; target data and source identifiers stay absent. */
export type AutomationStudioIdentityReacquireRecord = {
  kind: "identity";
  sourceNodeId?: never;
  returned?: never;
  outcome: "found" | "gone" | "unmatched" | "unavailable";
  reason?: AutomationStudioIdentityReacquireReason;
  at: number;
};
