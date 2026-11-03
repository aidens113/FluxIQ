/** Closed diagnostics only: host error text and target identity never enter the trace. */
export type AutomationStudioIdentityReacquireReason =
  | "ambiguous" | "unidentifiable"
  | "observation_unavailable" | "observation_incomplete" | "place_unproved" | "unsupported_target"
  | "no_refresh_declaration" | "scope_rejected" | "scope_unreadable"
  | "unresolved_parameters" | "parameters_unreadable"
  | "host_failed" | "malformed_answer" | "invalid_patch"
  | "binding_changed" | "authority_changed" | "action_effect_unavailable"
  | "aborted";
