// Test support: a fake FluxIQ Core with several threads across projects, behind
// a `ChatTransport` that has the thread list (`listAllThreads`) and, when asked,
// a change feed and New chat, Rename and Delete (`actions`). It counts every
// call, pages `readThread` forward from `sinceTurnId` as Core does, can push a
// change, and can refuse a delete. Nothing in production code imports this.

import type {
  ChatAnswer,
  ChatDeleteThreadRequest,
  ChatNewThreadRequest,
  ChatRenameThreadRequest,
  ChatResult,
  ChatSend,
  ChatThreadCatalogQuery,
  ChatThreadListQuery,
  ChatThreadReadQuery,
  ChatTransport
} from "../ports/index.ts";
import { relayState } from "./activity-fixture.ts";

/** One thread of the fake. */
export type CoreThread = {
  conversationId: string;
  projectId: string;
  subjectKind: "project" | "flow" | "build" | "run";
  title?: string | null;
  status?: "open" | "resolved";
  updatedAt: number;
  pendingAskCount?: number;
  turns: Array<{ turnId: string; author: "person" | "automation"; text: string }>;
};

export type ThreadsCore = {
  threads: CoreThread[];
  calls: {
    listAll: ChatThreadCatalogQuery[];
    list: ChatThreadListQuery[];
    read: ChatThreadReadQuery[];
    send: ChatSend[];
    answer: ChatAnswer[];
    newThread: ChatNewThreadRequest[];
    rename: ChatRenameThreadRequest[];
    remove: ChatDeleteThreadRequest[];
  };
  /** How many change listeners are subscribed now. */
  listening(): number;
  /** Pushes a change to every listener. */
  emit(change?: { conversationId?: string }): void;
  /** When set, the list answers this instead. */
  listAllFails: ChatResult<unknown> | undefined;
  /** When set, Delete answers this instead of deleting. */
  deleteFails: ChatResult<{ deleted?: boolean }> | undefined;
  transport(options?: { changes?: boolean; listAll?: boolean; actions?: boolean }): ChatTransport;
};

/** A thread with `count` turns of words "turn 1", "turn 2", .... */
export function thread(conversationId: string, fields: Partial<CoreThread> = {}, count = 1): CoreThread {
  return {
    conversationId,
    projectId: "project-1",
    subjectKind: "flow",
    updatedAt: 1_000,
    turns: Array.from({ length: count }, (_, index) => ({ turnId: `${conversationId}-t${index + 1}`, author: index % 2 === 0 ? "person" : "automation", text: `${conversationId} turn ${index + 1}` })),
    ...fields
  };
}

export function threadsCore(threads: CoreThread[]): ThreadsCore {
  const listeners = new Set<(change: { conversationId?: string }) => void>();
  const core: ThreadsCore = {
    threads,
    calls: { listAll: [], list: [], read: [], send: [], answer: [], newThread: [], rename: [], remove: [] },
    listening: () => listeners.size,
    emit(change = {}) {
      for (const listener of [...listeners]) listener(change);
    },
    listAllFails: undefined,
    deleteFails: undefined,
    transport(options = {}) {
      const record = (candidate: CoreThread) => ({
        conversationId: candidate.conversationId,
        projectId: candidate.projectId,
        revision: candidate.turns.length,
        status: candidate.status ?? "open",
        updatedAt: candidate.updatedAt,
        pendingAskCount: candidate.pendingAskCount ?? 0,
        title: candidate.title ?? null,
        subject: { kind: candidate.subjectKind }
      });
      const find = (conversationId: string) => core.threads.find((candidate) => candidate.conversationId === conversationId);
      return {
        conversation: {
          listThreads: async (query) => {
            core.calls.list.push(query);
            const found = core.threads.find((candidate) => candidate.subjectKind === query.subjectKind && (query.projectId === undefined || candidate.projectId === query.projectId));
            return { ok: true, value: { conversations: found === undefined ? [] : [record(found)] } };
          },
          readThread: async (query) => {
            core.calls.read.push(query);
            const found = find(query.conversationId);
            if (found === undefined) return { ok: true, value: { conversation: null } };
            const from = query.sinceTurnId === undefined ? 0 : found.turns.findIndex((turn) => turn.turnId === query.sinceTurnId) + 1;
            const page = found.turns.slice(from, from + query.limit);
            return { ok: true, value: { conversation: { conversation: record(found), turns: page.map((turn) => ({ ...turn, ask: null })), hasMore: from + query.limit < found.turns.length } } };
          },
          send: async (message) => {
            core.calls.send.push(message);
            const found = message.conversationId === undefined ? undefined : find(message.conversationId);
            const target = found ?? thread(`conv-new-${core.threads.length + 1}`, { projectId: message.projectId ?? "project-1", subjectKind: "project", updatedAt: 9_000 }, 0);
            if (found === undefined) core.threads.push(target);
            target.turns.push({ turnId: `${target.conversationId}-t${target.turns.length + 1}`, author: "person", text: message.text });
            return { ok: true, value: found === undefined ? { conversation: record(target) } : {} };
          },
          answer: async (answer) => {
            core.calls.answer.push(answer);
            return { ok: true, value: {} };
          },
          ...(options.listAll === false
            ? {}
            : {
              listAllThreads: async (query: ChatThreadCatalogQuery) => {
                core.calls.listAll.push(query);
                if (core.listAllFails !== undefined) return core.listAllFails as ChatResult<{ conversations?: unknown }>;
                const listed = core.threads.filter((candidate) => query.projectId === undefined || candidate.projectId === query.projectId);
                return { ok: true as const, value: { conversations: listed.map(record) } };
              }
            }),
          ...(options.actions === true
            ? {
              newThread: async (request: ChatNewThreadRequest) => {
                core.calls.newThread.push(request);
                const made = thread(`conv-new-${core.threads.length + 1}`, { projectId: request.projectId ?? "project-1", subjectKind: "project", updatedAt: 9_500 }, 0);
                core.threads.push(made);
                return { ok: true as const, value: { conversation: record(made) } };
              },
              renameThread: async (request: ChatRenameThreadRequest) => {
                core.calls.rename.push(request);
                const found = find(request.conversationId);
                if (found !== undefined) found.title = request.title;
                return { ok: true as const, value: found === undefined ? {} : { conversation: record(found) } };
              },
              deleteThread: async (request: ChatDeleteThreadRequest) => {
                core.calls.remove.push(request);
                if (core.deleteFails !== undefined) return core.deleteFails;
                core.threads = core.threads.filter((candidate) => candidate.conversationId !== request.conversationId);
                return { ok: true as const, value: { deleted: true } };
              }
            }
            : {})
        },
        activity: {
          read: async () => ({ ok: true, value: { state: relayState([]) } }),
          subscribe: () => () => undefined
        },
        runs: {
          stop: async () => ({ ok: true, value: {} }),
          takeOver: async () => ({ ok: true, value: undefined }),
          handBack: async () => ({ ok: true, value: undefined })
        },
        ...(options.changes === true
          ? {
            changes: {
              subscribe: (listener: (change: { conversationId?: string }) => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
              }
            }
          }
          : {})
      };
    }
  };
  return core;
}
