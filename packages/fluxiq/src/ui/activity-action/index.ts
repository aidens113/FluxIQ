// Barrel for the chat's action cards: the kinds of action FluxIQ takes, the
// icon and short name each kind's card shows, and the classifier that reads an
// activity event into one. Plain data and pure functions, shared by every
// client that shows the activity stream, and the one sentence splitter for
// the words the chat shows.
export { activityActionOf } from "./action-of.ts";
export { activityActionFailureReason } from "./failure-reason.ts";
export { ACTIVITY_ACTION_ICONS } from "./icons.ts";
export { activityActionKey } from "./key.ts";
export { ACTIVITY_ACTION_NAMES } from "./names.ts";
export { ACTIVITY_ACTION_REFUSAL_WORDS } from "./refusal-words.ts";
export { ACTIVITY_RESULT_CHECK_LABELS } from "./result-check-labels.ts";
export { activityActionReplayFailing } from "./replay-failing.ts";
export { activityActionSentences } from "./sentences.ts";
export { activityActionTested } from "./tested.ts";
export type { ActivityAction, ActivityActionEvent, ActivityActionKind, ActivityActionOutcome, ActivityActionVerb } from "./types.ts";
export { activityActionVerb } from "./verb.ts";
