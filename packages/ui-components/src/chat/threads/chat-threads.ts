// The conversation list as the chat uses it: the catalog of threads, the header
// and the list that show it, New chat, Rename and Delete, and the rules that tie
// it to the chat's target. The widget calls the few methods below; everything
// about which thread opens and what is told to the host lives here.
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
//   - For a host that gives `unavailableReason`, with no project and no thread
//     there is nowhere to read or send: the card is empty and the composer says
//     why, until a thread is listed. A host that leaves it out has a transport
//     that names the session's project itself, so its project-less latest chat
//     is read and written to as it is without a thread list.
//   - Where the list sits is `options.layout` (`ChatThreadsLayout`): a drawer
//     the "Chats" button opens in the thread's place, closed again by Escape,
//     by opening a chat or by a new one; or a column beside the thread. A chat
//     opened from the list, or a new one, hands focus to the composer.
//   - New chat, Rename and Delete are `thread-actions.ts`.

import type { ChatThreadsLayout, ChatThreadsOptions } from "../ports/index.ts";
import { conversationDisplayTitle, createThreadCatalog, threadToSelect, unansweredThreadCount, type ThreadCatalogDeps } from "../conversation/index.ts";
import { threadRows } from "../conversation/thread-list/index.ts";
import { createElement } from "../../dom/index.ts";
import type { ChatTarget } from "../target.ts";
import { createThreadHeader } from "../view/index.ts";
import { createConversationList } from "../view/thread-list/index.ts";
import { createThreadActions, type ThreadActionPorts } from "./thread-actions.ts";

/** What the widget gives the thread list to work with. */
export type ChatThreadsDeps = {
  options: ChatThreadsOptions;
  /** Reads the list, through the owner of the moment. */
  list: ThreadCatalogDeps["list"];
  /** New chat, Rename and Delete through the owner of the moment, each present only when the client's port has it. */
  actions: ThreadActionPorts;
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
  /** Puts the caret in the composer. */
  focusComposer(): void;
};

/** The mounted thread list. */
export type ChatThreads = {
  /** Where the list sits. */
  readonly layout: ChatThreadsLayout;
  /** The chat panel's children with the list in place: `top` above the header (the context line), `rest` under it. */
  frame(top: readonly HTMLElement[], rest: readonly HTMLElement[]): HTMLElement[];
  /** Reads the list. Never rejects. */
  read(): Promise<void>;
  /** Draws the header and the list for the thread on screen (`conversationId`, once read) and tells the host its name. */
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

let mounted = 0;

/** Creates the thread list. */
export function createChatThreads(deps: ChatThreadsDeps): ChatThreads {
  const { options } = deps;
  const layout: ChatThreadsLayout = options.layout ?? "drawer";
  mounted += 1;
  const listId = `chat-thread-list-${mounted}`;
  // The thread to come back to, until a thread has been chosen once.
  let restore = options.initialConversationId;
  let heardCount: number | undefined;
  let heardTitle: string | undefined;
  let heardThread: string | undefined;
  let drawn: string | undefined;
  let open = layout === "column";

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
  const actions = createThreadActions({
    ports: deps.actions,
    catalog,
    projectId: deps.projectId,
    target: deps.target,
    open: deps.open,
    changed: () => render(drawn)
  });
  const header = createThreadHeader(layout, () => setOpen(!open), listId);
  const list = createConversationList(listId, layout, {
    open(conversationId) {
      const thread = catalog.threads().find((candidate) => candidate.conversationId === conversationId);
      if (thread === undefined) return;
      deps.open({ kind: "thread", conversationId, projectId: thread.projectId });
      handOff();
    },
    create() {
      void actions.create().then((made) => {
        if (made) handOff();
      });
    },
    rename: (conversationId, title) => void actions.rename(conversationId, title),
    remove: (conversationId) => void actions.remove(conversationId),
    more: () => void catalog.more(),
    close() {
      if (layout !== "drawer" || !open) return;
      setOpen(false);
      header.toggle?.focus();
    }
  });
  list.element.hidden = !open;

  /** A chat came on screen from the list: the drawer gives the thread back and the composer takes the caret. */
  function handOff(): void {
    if (layout === "drawer") setOpen(false);
    deps.focusComposer();
  }

  function setOpen(next: boolean): void {
    if (layout !== "drawer" || next === open) return;
    open = next;
    list.element.hidden = !next;
    render(drawn);
    if (next) list.focus();
  }

  function adopt(): void {
    if (deps.busy()) return;
    const thread = threadToSelect(deps.target(), catalog.threads(), restore);
    if (thread === undefined) return;
    restore = undefined;
    deps.open({ kind: "thread", conversationId: thread.conversationId, projectId: thread.projectId });
  }

  /** A latest chat with no project, for a host whose transport has nowhere to send without one (it gave a reason). */
  function nowhere(): boolean {
    if (options.unavailableReason === undefined) return false;
    const target = deps.target();
    return target.kind === "latest" && target.projectId === undefined;
  }

  function render(conversationId: string | undefined): void {
    drawn = conversationId;
    const target = deps.target();
    const shownId = target.kind === "thread" ? target.conversationId : conversationId;
    const threads = catalog.threads();
    const selected = threads.find((thread) => thread.conversationId === shownId) ?? null;
    const title = conversationDisplayTitle(selected, deps.projectName());
    header.update({ title, showTitle: options.onTitle === undefined, open, waiting: unansweredThreadCount(threads) });
    list.update({
      rows: threadRows(threads, selected?.conversationId, Date.now()),
      loaded: catalog.loaded(),
      hasMore: catalog.hasMore(),
      can: actions.can,
      busy: actions.busy(),
      notice: actions.notice()
    });
    if (title !== heardTitle) {
      heardTitle = title;
      options.onTitle?.(title);
    }
  }

  return {
    layout,
    frame(top, rest) {
      if (layout === "drawer") return [...top, header.element, list.element, ...rest];
      return [list.element, createElement("div", { className: "chat-body" }, [...top, header.element, ...rest])];
    },
    read: () => catalog.read(),
    render,
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
      actions.reset();
      heardCount = undefined;
      heardTitle = undefined;
      heardThread = undefined;
      if (layout === "drawer" && open) setOpen(false);
    }
  };
}
