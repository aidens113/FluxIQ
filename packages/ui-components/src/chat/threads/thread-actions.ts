// What the conversation list does to Core's threads: New chat, Rename and
// Delete, each offered only when the client's port has it. No DOM.
//
//   - Each press asks Core and, once Core has answered, reads the list again so
//     it shows what Core now holds. While a press is on its way the list
//     offers no other.
//   - A refusal is shown in Core's own sentence (Core will not delete a thread
//     whose work still runs: `conversation_run_active`) until the next press.
//   - New chat opens the thread Core made. It is about the host's project, or,
//     with no project open, about the panel as a whole.
//   - A deleted thread leaves the list at once. When it was on screen, the next
//     thread of the list opens, else the one before it, else the latest chat,
//     which is the empty chat when nothing is left.
//   - An answer for an owner the chat no longer has lands nowhere (`reset`).

import { parseConversation, type ChatThreadSummary, type ThreadCatalog } from "../conversation/index.ts";
import type { ChatDeleteThreadRequest, ChatNewThreadRequest, ChatRenameThreadRequest, ChatResult } from "../ports/index.ts";
import type { ChatTarget } from "../target.ts";

/** The client's New chat, Rename and Delete; each present only when the client's port has it. */
export type ThreadActionPorts = {
  newThread?(request: ChatNewThreadRequest): Promise<ChatResult<{ conversation?: unknown }>>;
  renameThread?(request: ChatRenameThreadRequest): Promise<ChatResult<{ conversation?: unknown }>>;
  deleteThread?(request: ChatDeleteThreadRequest): Promise<ChatResult<{ deleted?: boolean }>>;
};

/** What the actions work with. */
export type ThreadActionsDeps = {
  ports: ThreadActionPorts;
  catalog: ThreadCatalog;
  /** The project the host has open, if any. */
  projectId(): string | undefined;
  /** The target on screen. */
  target(): ChatTarget;
  /** Shows `target`. */
  open(target: ChatTarget): void;
  /** A press started or ended, or its refusal changed. */
  changed(): void;
};

/** The mounted actions. */
export type ThreadActions = {
  /** Which presses the client's port carries. */
  readonly can: { readonly create: boolean; readonly rename: boolean; readonly remove: boolean };
  /** True while a press is on its way. */
  busy(): boolean;
  /** Core's sentence for the last press it refused, until the next press. */
  notice(): string | undefined;
  /** New chat; true once the new thread is on screen. Never rejects. */
  create(): Promise<boolean>;
  /** Renames a thread; true once Core took the name. Never rejects. */
  rename(conversationId: string, title: string): Promise<boolean>;
  /** Deletes a thread; true once Core deleted it. Never rejects. */
  remove(conversationId: string): Promise<boolean>;
  /** Forgets the press on its way and the last refusal, for another owner. */
  reset(): void;
};

const UNREACHABLE = "Couldn't reach FluxIQ. Try again.";
const NOT_DELETED = "That chat wasn't deleted. Try again.";
const NEW_UNREAD = "The new chat was made, but it couldn't be opened. Pick it from the list.";

/** Creates the actions. */
export function createThreadActions(deps: ThreadActionsDeps): ThreadActions {
  const { ports, catalog } = deps;
  let pending = false;
  let refusal: string | undefined;
  // Bumped on reset, so an answer for the last owner is dropped.
  let epoch = 0;

  /** Runs one press; `land` takes Core's answer for this owner and says whether it succeeded. */
  async function press<T>(call: () => Promise<ChatResult<T>>, land: (value: T) => boolean): Promise<boolean> {
    if (pending) return false;
    const mine = epoch;
    pending = true;
    refusal = undefined;
    deps.changed();
    let result: ChatResult<T>;
    try {
      result = await call();
    } catch {
      result = { ok: false, sentence: UNREACHABLE, code: "failed" };
    }
    if (mine !== epoch) return false;
    pending = false;
    if (!result.ok) refusal = result.sentence;
    const done = result.ok && land(result.value);
    deps.changed();
    void catalog.read();
    return done;
  }

  function projectOf(conversationId: string): string | undefined {
    return catalog.threads().find((thread) => thread.conversationId === conversationId)?.projectId;
  }

  return {
    can: { create: ports.newThread !== undefined, rename: ports.renameThread !== undefined, remove: ports.deleteThread !== undefined },
    busy: () => pending,
    notice: () => refusal,
    create() {
      const newThread = ports.newThread;
      if (newThread === undefined) return Promise.resolve(false);
      const projectId = deps.projectId();
      const request: ChatNewThreadRequest = projectId === undefined ? { subjectKind: "panel" } : { projectId, subjectKind: "project" };
      return press(() => newThread.call(ports, request), (value) => {
        const opened = parseConversation(value.conversation);
        if (opened === undefined) {
          refusal = NEW_UNREAD;
          return false;
        }
        deps.open({ kind: "thread", conversationId: opened.conversationId, projectId: opened.projectId });
        return true;
      });
    },
    rename(conversationId, title) {
      const renameThread = ports.renameThread;
      const name = title.trim();
      if (renameThread === undefined || name === "") return Promise.resolve(false);
      const projectId = projectOf(conversationId);
      return press(() => renameThread.call(ports, { conversationId, title: name, ...(projectId === undefined ? {} : { projectId }) }), () => true);
    },
    remove(conversationId) {
      const deleteThread = ports.deleteThread;
      if (deleteThread === undefined) return Promise.resolve(false);
      const projectId = projectOf(conversationId);
      return press(() => deleteThread.call(ports, { conversationId, ...(projectId === undefined ? {} : { projectId }) }), (value) => {
        if (value.deleted === false) {
          refusal = NOT_DELETED;
          return false;
        }
        const target = deps.target();
        const shown = target.kind === "thread" && target.conversationId === conversationId;
        const next = shown ? threadAfter(catalog.threads(), conversationId) : undefined;
        catalog.drop(conversationId);
        if (!shown) return true;
        const hostProject = deps.projectId();
        if (next !== undefined) deps.open({ kind: "thread", conversationId: next.conversationId, projectId: next.projectId });
        else deps.open(hostProject === undefined ? { kind: "latest" } : { kind: "latest", projectId: hostProject });
        return true;
      });
    },
    reset() {
      epoch += 1;
      pending = false;
      refusal = undefined;
    }
  };
}

/** The thread that takes a deleted one's place on screen: the next in the list, else the one before it. */
function threadAfter(threads: readonly ChatThreadSummary[], conversationId: string): ChatThreadSummary | undefined {
  const index = threads.findIndex((thread) => thread.conversationId === conversationId);
  if (index < 0) return undefined;
  return threads[index + 1] ?? threads[index - 1];
}
