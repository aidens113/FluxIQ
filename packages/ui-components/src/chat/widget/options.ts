// How a client mounts the chat.

import type { ChatComposerOptions } from "../conversation/index.ts";
import type { ChatActivitySource } from "../feed/index.ts";
import type { ChatAskPort, ChatAttachmentPort, ChatOpenControlFactory, ChatThreadsOptions, ChatWelcome } from "../ports/index.ts";
import type { ModelKeyHostAction } from "../../model-access/index.ts";
import type { TurnMeta } from "../view/index.ts";

/** How a client mounts the chat. */
export type ChatWidgetOptions = {
  /** Hears whether the thread has turns, each time that changes. */
  onConversation?: (hasTurns: boolean) => void;
  /**
   * Whether the chat shows its own line naming the automation, with "Latest
   * chat" (default true). A panel that shows the open automation above the
   * chat itself passes false, so the name is not said twice.
   */
  contextLine?: boolean;
  /**
   * The empty latest chat's "Extract data from this page": the panel shows its extraction sheet.
   * Absent, the empty chat does not offer it.
   */
  onExtract?: () => void;
  /**
   * Makes an Open FluxIQ control, for a question that only FluxIQ can show; the host draws it, so the
   * chat does not reach into the host. Absent, the model-key line has no link and an ask's Open FluxIQ is empty.
   */
  openControl?: ChatOpenControlFactory;
  /**
   * The key card's host actions (change the model, how to update, open FluxIQ's key page). Absent, each
   * presses the Open FluxIQ control. The card re-reads the key itself for "Try now".
   */
  onModelKeyAction?: (action: ModelKeyHostAction) => void;
  /**
   * The owner key the chat starts under, so a first status with the same key is not a change of owner.
   * With `threads`, leave it out: the first status is what scopes the latest chat to the host's project.
   */
  ownerKey?: string;
  /**
   * Holds a list of Core's threads instead of one thread at a time (needs `conversation.listAllThreads`): a
   * conversation list with search, as a drawer or a column (`layout`), with New chat, Rename and Delete where
   * the conversation port carries `newThread`, `renameThread` and `deleteThread`.
   */
  threads?: ChatThreadsOptions;
  /**
   * The chat bar above the thread (default true; needs `threads` in a drawer): the chat's name, a "Chats"
   * button with how many chats wait on the person, and "+ New chat" where the transport can make one. The
   * bar draws the name itself, so a host that also takes it through `threads.onTitle` shows it twice.
   */
  chatBar?: boolean;
  /**
   * The host's own activity feed, so the chat reads and hears the one the host already runs instead of
   * starting a second (`ChatActivitySource`). The host starts and stops it; the chat only hears it. Absent,
   * the chat starts its own from the transport's `activity` port.
   */
  activity?: ChatActivitySource;
  /** What the empty chat says instead of its onboarding about the page. */
  welcome?: ChatWelcome;
  /** The fallback's words instead of "Talk to FluxIQ in the FluxIQ window.". */
  fallback?: { title: string; line: string };
  /** Turns kept per thread instead of 20; older ones sit behind one "Show earlier turns" control. */
  history?: { window: number };
  /** The host's words for a pending question, and the dialog that asks for the PIN before an answer with a lasting effect. */
  asks?: ChatAskPort;
  /** What a turn carries beside its words, drawn by the host; panel records told apart from the person. */
  attachments?: ChatAttachmentPort;
  /** Who said each turn and when: a visually hidden header and a hover title, the transcript announced politely. */
  turnMeta?: TurnMeta;
  /** "FluxIQ stopped here and is waiting on your answer." with Show me, while a turn holds a question nobody answered. */
  pendingBanner?: boolean;
  /** The composer's length limit, hint, draft keeping and send hover. */
  composer?: ChatComposerOptions;
};
