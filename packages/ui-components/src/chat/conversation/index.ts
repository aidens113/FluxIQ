// FluxIQ Core's conversation, read and fed through the conversation port.
// `controller.ts` holds what is on screen and `thread-requests.ts` which
// thread that is for each target; `composer.ts`, `ask-controls.ts` and
// `read/notice.ts` are the parts the chat window (`chat-widget.ts`) mounts.
export type { AnswerOutcome } from "./answer-outcome.ts";
export { askControls, type AskControlsContext } from "./ask-controls.ts";
export { askPresentation, type AskChoice, type AskPresentation } from "./ask-copy.ts";
export type { ChatComposerOptions } from "./chat-composer-options.ts";
export { createComposer, type Composer } from "./composer.ts";
export { composerKeyAction, type ComposerKey, type ComposerKeyAction } from "./composer-keys.ts";
export {
  createConversationController,
  type ConversationController,
  type ConversationFallbackReason,
  type ConversationMode,
  type ConversationReach,
  type ConversationState
} from "./controller.ts";
export { createReadNotice, READ_RETRY, readFailureNotice, UNREADABLE_CODE, type ConversationClock, type ReadNotice, type ThreadReadStep } from "./read/index.ts";
export { problemOf } from "./problem-of.ts";
export { parseConversation, parseThreadPage, type CoreAsk, type CoreConversation, type CoreThreadPage, type CoreTurn } from "./core-thread.ts";
export {
  conversationDisplayTitle,
  conversationSubjectFallbackLabel,
  conversationSubjectLabel,
  createThreadCatalog,
  parseThreadList,
  sortThreadsForList,
  threadOptions,
  threadToSelect,
  unansweredThreadCount,
  type ChatThreadSummary,
  type ThreadCatalog,
  type ThreadCatalogDeps,
  type ThreadOption,
  type ThreadSubjectKind
} from "./thread-list/index.ts";
export { threadListRequest, threadSendRequest, type ShownThread } from "./thread-requests.ts";
export { ALL_TURNS, readThreadTail, TURN_WINDOW, type ThreadTail, type ThreadTailTarget } from "./thread-tail.ts";
