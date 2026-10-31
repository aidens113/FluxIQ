import type { AutomationStudioTargetRefresh } from "./refresh.ts";

/** The trusted registry's declaration, or a closed diagnostic when it cannot grant refresh authority. */
export type AutomationStudioTargetRefreshResolution =
  | { kind: "declared"; refresh: AutomationStudioTargetRefresh }
  | { kind: "absent"; reason: "unregistered_definition" | "no_refresh_declaration" }
  | { kind: "rejected"; reason: "ambiguous_definition" | "invalid_declaration" | "invalid_output" }
  | { kind: "unreadable"; reason: "registry_unreadable" };
