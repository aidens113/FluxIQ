export type ExecutableChangeProposalKind =
  | "create_subflow"
  | "edit_subflow"
  | "edit_router"
  | "edit_expectation"
  | "edit_action_target"
  | "edit_recovery"
  | "insert_deterministic_path"
  | "promote_adaptation"
  | "edit_instruction"
  | "add_handler"
  | "replace_unit";
