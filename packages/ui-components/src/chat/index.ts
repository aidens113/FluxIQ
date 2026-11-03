// The chat: FluxIQ Core's conversation (the latest thread, or one
// automation's) and FluxIQ's live activity in one window that fills the
// container a client gives it. `chat-widget.ts` mounts it through the ports a
// client supplies (`ports/`); `conversation/`, `feed/`, `stream/` and
// `format/` hold what it knows, each without DOM where it can be, and `view/`
// builds and updates the parts. The client's own surfaces (an on-page status
// preference, an Open FluxIQ control) stay with the client.
export { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "./chat-widget.ts";
export {
  conversationDisplayTitle,
  conversationSubjectFallbackLabel,
  conversationSubjectLabel,
  parseThreadList,
  sortThreadsForList,
  threadOptions,
  unansweredThreadCount,
  type AnswerOutcome,
  type ChatComposerOptions,
  type ChatThreadSummary,
  type ThreadOption,
  type ThreadSubjectKind
} from "./conversation/index.ts";
export { createHoldControl, createStopControl } from "./controls/index.ts";
export {
  createActivityFeed,
  threadRefreshWanted,
  type ActivityFeed,
  type ActivityFeedDeps,
  type ActivityFeedReach,
  type ActivityFeedSnapshot,
  type ActivityPushListener,
  type ThreadRefreshDecision
} from "./feed/index.ts";
export { parseAssistantText, renderTextBlocks, type TextBlock, type TextRun } from "./format/index.ts";
export * from "./ports/index.ts";
export { bindChatProjectNavigation, CHAT_PROJECT_NAVIGATION, createProjectDraftOwner } from "./project-navigation/index.ts";
export {
  actionCard,
  activityForTarget,
  buildChatStream,
  cardWords,
  CHAT_STEP_MESSAGE_LIMIT,
  createTurnClock,
  followedRunTarget,
  stepMessages,
  stepWords,
  type ActionCard,
  type CardWords,
  type ChatStream,
  type ChatStreamItem,
  type RunTargetInput,
  type StepMessage
} from "./stream/index.ts";
export type { ChatTarget } from "./target.ts";
export { conversationLauncherLabel, createChatWindow, type ChatWindow, type ChatWindowChat, type ChatWindowOptions } from "./window/index.ts";
export { createChatOwnerContext, type ChatOwner } from "./owner-context.ts";
export { emptyStateModel, isAtBottom, liveLineModel, stepText, type EmptyStateModel, type LiveLineModel, type TurnMeta } from "./view/index.ts";
