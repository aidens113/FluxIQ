import type { AutomationStudioInputUnknownCode } from "../../../runtime/input-basis/contracts/index.ts";

export type AutomationStudioInputUseUnknown = AutomationStudioInputUnknownCode
  | "unobserved" | "session_closed" | "port_reused" | "authority_unavailable" | "authority_failed"
  | "active_secrets" | "unverified_frame" | "resume_state_unverified" | "lease_mismatch"
  | "unconsumed" | "handoff_mismatch" | "parent_unverified" | "fork_unverified" | "cancelled"
  | "captured_records" | "records_unavailable" | "entry_unverified" | "incomplete";
