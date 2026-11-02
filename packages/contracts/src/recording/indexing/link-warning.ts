export type RecordingStateLinkWarning = {
  code: "no_states" | "action_without_state" | "ambiguous_state_timestamp";
  actionId?: string;
  entryId?: string;
  message: string;
};
