// What turns the chat from one thread into a window on all of them. Absent, the
// chat shows one thread at a time, as `open` says.

/** One line of the welcome. `icon` is a lucide name (`icons/`). */
export type ChatWelcomeItem = { icon: string; title: string; body: string };

/** What the empty chat says instead of its own onboarding, for a host whose chat is not about a page. */
export type ChatWelcome = { title: string; line: string; items: readonly ChatWelcomeItem[] };

export type ChatThreadsOptions = {
  /** Opens on this thread rather than the one waiting on the person. A thread that is no longer listed is ignored. */
  initialConversationId?: string;
  /** Hears each thread the person or the chat selects, so a host can restore it. */
  onSelected?(conversationId: string): void;
  /** Hears how many threads hold a question nobody has answered, read also while the chat is in the background. */
  onUnanswered?(count: number): void;
  /** Hears the chat's name. When set, the chat draws no name of its own; it still draws the thread picker. */
  onTitle?(title: string): void;
  /** Why there is nowhere to send, shown over a disabled composer when there is no thread and no project. */
  unavailableReason: string;
};
