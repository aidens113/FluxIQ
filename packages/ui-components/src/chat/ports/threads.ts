// What turns the chat from one thread into a window on all of them. Absent, the
// chat shows one thread at a time, as `open` says.

/** One line of the welcome. `icon` is a lucide name (`icons/`). */
export type ChatWelcomeItem = { icon: string; title: string; body: string };

/** What the empty chat says instead of its own onboarding, for a host whose chat is not about a page. */
export type ChatWelcome = { title: string; line: string; items: readonly ChatWelcomeItem[] };

/**
 * Where the conversation list sits. `drawer` (the default, for a narrow host
 * such as a 360 px side panel or a 400 px popup): a "Chats" button over the
 * thread, naming the chat on screen, opens the list in the thread's place.
 * `column`: the list stands as a column left of the thread, for a wide host.
 */
export type ChatThreadsLayout = "drawer" | "column";

export type ChatThreadsOptions = {
  /** Where the conversation list sits; `drawer` when absent. */
  layout?: ChatThreadsLayout;
  /** Opens on this thread rather than the one waiting on the person. A thread that is no longer listed is ignored. */
  initialConversationId?: string;
  /** Hears each thread the person or the chat selects, so a host can restore it. */
  onSelected?(conversationId: string): void;
  /** Hears how many threads hold a question nobody has answered, read also while the chat is in the background. */
  onUnanswered?(count: number): void;
  /** Hears the chat's name. When set, the chat draws no name of its own; it still draws the "Chats" button and the list. */
  onTitle?(title: string): void;
  /**
   * Why there is nowhere to send, shown over a disabled composer when there is no thread and no project.
   * Set it when the host's transport has nowhere to send a message that names no project (a host whose
   * person must open a project first): the project-less latest chat then reads nothing and waits for a
   * thread to be listed. Leave it out when the transport finds the project itself for a message that names
   * none (the session's project, as a browser extension's background does): the project-less latest chat is
   * then read and written to as it is without a thread list, and its composer is never disabled for want
   * of a project.
   */
  unavailableReason?: string;
};
