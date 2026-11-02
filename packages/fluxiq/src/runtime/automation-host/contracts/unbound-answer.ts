import type { AutomationStudioTargetRefreshPatch } from "./refresh-patch.ts";

/** A same-identity target match; incomplete or unreadable observation never establishes gone. */
export type AutomationStudioUnboundTargetReacquireAnswer =
  | { outcome: "found"; patches: readonly AutomationStudioTargetRefreshPatch[] }
  | { outcome: "gone"; coverage: "complete" }
  | { outcome: "unmatched"; reason: "ambiguous" | "unidentifiable" }
  | { outcome: "unavailable"; reason:
      "observation_unavailable" | "observation_incomplete" |
      "place_unproved" | "unsupported_target" };
