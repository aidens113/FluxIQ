// The thread list as the chat uses it: the catalog of threads, the header that
// shows it, and the rules that tie it to the chat's target. The widget calls
// the few methods below; everything about which thread opens and what is told
// to the host lives here.
//
//   - The list is read on each beat and when a change is heard. The count of
//     threads holding an unanswered question is told to `onUnanswered`
//     whenever it changes, also while the chat is in the background.
//   - The latest chat gives way to a thread: `initialConversationId` when it is
//     listed, else the first thread of the list (the one waiting on the person,
//     else the newest). Once a thread is on screen it stays, whether the person
//     chose it or the chat did, and an automation's or a question's chat that
//     the host opened is never taken over. Nothing is taken while a message is
//     being sent.
//   - `onSelected` hears each thread that comes on screen, `onTitle` the
//     chat's name (Core's title, the project's name, or "All projects").
//   - With no project and no thread there is nowhere to read or send: the card
//     is empty and the composer says why, until a thread is listed.

import type { ChatThreadsOptions } from "../ports/index.ts";
import {
  conversationDisplayTitle,
  createThreadCatalog,
  threadOptions,
  threadToSelect,
  unansweredThreadCount,
  type ThreadCatalogDeps
} from "../conversation/index.ts";
import type { ChatTarget } from "../target.ts";
import { createThreadHeader } from "../view/index.ts";

/** What the widget gives the thread list to work with. */
export type ChatThreadsDeps = {
  options: ChatThreadsOptions;
  /** Reads the list, through the owner of the moment. */
  list: ThreadCatalogDeps["list"];
  /** The project the host has open, if any. */
  projectId(): string | undefined;
  projectName(): string | null | undefined;
  /** The target on screen. */
  target(): ChatTarget;
  /** Shows `target`. */
  open(target: ChatTarget): void;
  /** True while a message is on its way. */
  busy(): boolean;
  /** The list changed, or was read for the first time. */
  changed(): void;
};

/** The mounted thread list. */
export type ChatThreads = {
  /** The header: the picker, or the name. */
  readonly element: HTMLElement;
  /** Reads the list. Never rejects. */
  read(): Promise<void>;
  /** Draws the header for the thread on screen (`conversationId`, once read) and tells the host its name. */
  render(conversationId: string | undefined): void;
  /** Hears that the chat's target changed: tells the host which thread, or gives a latest chat a thread. */
  targetChanged(target: ChatTarget): void;
  /** For a latest chat with no project: whether the list is still unread (`waiting`) or holds no thread (`empty`). */
  withoutProject(): "waiting" | "empty" | undefined;
  /** Why there is nowhere to send, while there is none. */
  unavailable(): string | undefined;
  /** Forgets everything of the last owner. */
  reset(): void;
};

/** Creates the thread list. */
export function createChatThreads(deps: ChatThreadsDeps): ChatThreads {
  const { options } = deps;
  // The thread to come back to, until a thread has been chosen once.
  let restore = options.initialConversationId;
  let heardCount: number | undefined;
  let heardTitle: string | undefined;
  let heardThread: string | undefined;

  const catalog = createThreadCatalog({
    list: deps.list,
    projectId: deps.projectId,
    changed() {
      const count = unansweredThreadCount(catalog.threads());
      if (count !== heardCount) {
        heardCount = count;
        options.onUnanswered?.(count);
      }
      adopt();
      deps.changed();
    }
  });
  const header = createThreadHeader((conversationId) => {
    const thread = catalog.threads().find((candidate) => candidate.conversationId === conversationId);
    if (thread !== undefined) deps.open({ kind: "thread", conversationId, projectId: thread.projectId });
  });

  function adopt(): void {
    if (deps.busy()) return;
    const thread = threadToSelect(deps.target(), catalog.threads(), restore);
    if (thread === undefined) return;
    restore = undefined;
    deps.open({ kind: "thread", conversationId: thread.conversationId, projectId: thread.projectId });
  }

  function nowhere(): boolean {
    const target = deps.target();
    return target.kind === "latest" && target.projectId === undefined;
  }

  return {
    element: header.element,
    read: () => catalog.read(),
    render(conversationId) {
      const target = deps.target();
      const shownId = target.kind === "thread" ? target.conversationId : conversationId;
      const threads = catalog.threads();
      const selected = threads.find((thread) => thread.conversationId === shownId) ?? null;
      const title = conversationDisplayTitle(selected, deps.projectName());
      header.update({ options: threadOptions(threads), selectedId: selected?.conversationId, title, showTitle: options.onTitle === undefined });
      if (title !== heardTitle) {
        heardTitle = title;
        options.onTitle?.(title);
      }
    },
    targetChanged(target) {
      if (target.kind === "latest") return adopt();
      if (target.kind !== "thread" || target.conversationId === heardThread) return;
      heardThread = target.conversationId;
      options.onSelected?.(target.conversationId);
    },
    withoutProject: () => (nowhere() ? (catalog.loaded() ? "empty" : "waiting") : undefined),
    unavailable: () => (nowhere() ? options.unavailableReason : undefined),
    reset() {
      catalog.forget();
      heardCount = undefined;
      heardTitle = undefined;
      heardThread = undefined;
    }
  };
}
