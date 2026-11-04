// Why the state rule could not answer a command from one exploration's recording.
//
// The state rule's own vocabulary. It repeats the trace matcher's reasons it shares and
// adds the rule's own. The matcher never gives the rule's own, so its list stays as it is
// (`../trace-matcher/gap-reasons.ts`), and with it what a gate's words must cover. U5 knows
// them by deliberate edit (`flows/authoring/model/offline-trial/vocabulary.ts`), so a state
// trial's gaps are its reason codes as they stand; the drift test is
// `framework/automation-service/service/offline-trial/tests/gap-vocabulary.test.ts`.
//
// Shared with the matcher:
// - `missing_transition`: no recorded call of this kind holds this input;
// - `argument_mismatch`: a recorded read of this action exists, with other input;
// - `redacted_input`: what the command would be answered from was withheld at capture;
// - `incomplete_capture`: the trace holds no readable answer for the recorded call.
//
// The rule's own (the study's section 4):
// - `state_changed_by_act`: this input was recorded, after other acts than this
//   run did. Answering would show what this run did not cause;
// - `other_position`: this input was recorded, on another page position;
// - `would_repeat_act`: this act was already used, and each recorded act lands once;
// - `after_unrecorded_act`: an earlier act of this run was never recorded, so the
//   recording no longer describes the site;
// - `after_unrecorded_move`: an earlier page move of this run was not answered, so
//   the page's position is unknown until a recorded absolute move restores it;
// - `other_row`: the same act was recorded, on another row;
// - `act_out_of_order`: a recorded act, before one already used, and not its sibling;
// - `wait_longer_than_recorded`: the recording gave up sooner than this command would;
// - `wait_shorter_than_recorded`: the recorded answer came later than this command waits.
export const CLIENT_GATEWAY_TRACE_STATE_GAP_CODES = Object.freeze([
  "missing_transition",
  "argument_mismatch",
  "redacted_input",
  "incomplete_capture",
  "state_changed_by_act",
  "other_position",
  "would_repeat_act",
  "after_unrecorded_act",
  "after_unrecorded_move",
  "other_row",
  "act_out_of_order",
  "wait_longer_than_recorded",
  "wait_shorter_than_recorded"
] as const);
