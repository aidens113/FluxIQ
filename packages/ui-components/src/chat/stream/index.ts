// The chat's message stream as data: Core's activity events as FluxIQ's step
// messages, one per decision, check or repair, with its reason and each
// action it took as a card (`stepMessages`, `actionCard`, `cardWords`;
// internal reads dropped, ids put in words), thread turns and those messages on one timeline
// (`buildChatStream`), which activity belongs to the chat on screen
// (`activityForTarget`), and which thread holds the question work is waiting
// on (`askThread`). No DOM.
export { askThread, type QuestionTarget } from "./ask-thread.ts";
export {
  actionCard,
  cardWords,
  doneAgainWords,
  stepMessages,
  stepWords,
  type ActionCard,
  type CardWords,
  type StepMessage,
  type StepMessageKind,
  type StepWords
} from "./step/index.ts";
export { FROM_SAVED_STEPS, WORKED_OUT_AGAIN } from "./saved-marks.ts";
export { buildChatStream, CHAT_STEP_MESSAGE_LIMIT, type ChatStream, type ChatStreamItem } from "./stream-items.ts";
export { followedRunTarget, threadKey, type RunTargetInput } from "./run-target.ts";
export { activityForTarget, type TargetActivity } from "./target-activity.ts";
export { createTurnClock, type StampedTurn, type TurnClock } from "./turn-clock.ts";
