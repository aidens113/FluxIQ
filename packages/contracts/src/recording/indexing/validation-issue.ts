export type RecordingStateIndexValidationIssue = {
  code:
    | "invalid_schema_version"
    | "invalid_identity"
    | "invalid_summary"
    | "entry_key_mismatch"
    | "action_key_mismatch"
    | "state_key_mismatch"
    | "proposal_key_mismatch"
    | "missing_entry"
    | "missing_action"
    | "missing_state"
    | "missing_state_ref"
    | "invalid_object_ref"
    | "cross_project_ref"
    | "proposal_recording_mismatch";
  path: string;
  message: string;
};
