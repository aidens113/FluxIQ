// A fake FluxIQ Core with several threads, each about a subject, for the
import { TEST_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";
// target tests: `list-conversations` narrows by subject as Core does and
// otherwise answers the most recently touched thread (a `project` subject with
// no id is the project's own thread, the id the relay fills in); a first message with
// a subject continues that subject's open thread or opens one, as Core's
// `open-conversation` does. A turn may carry a question (`ask`, Core's shape);
// an answer to it settles it, as Core's `answer-ask` does. It records every
// message it was sent, and can hold back its answers until a test lets them go.


type FakeAsk = { askId: string; kind: string; status: string; options?: Array<{ id: string; label: string }>; answer?: { kind: string; value: string | null } };
type Thread = { conversationId: string; subjectKind: string; subjectId: string; revision: number; touched: number; turns: Array<{ turnId: string; author: string; text: string; ask?: FakeAsk; createdAt?: number }> };

export type TargetCore = {
  sent: TestMessage[];
  threads: Thread[];
  /** While set, every answer waits until `release` is called. */
  hold: boolean;
  release(): void;
  request<T>(message: TestMessage): Promise<ChatResult<T>>;
  thread(conversationId: string): Thread | undefined;
};

/** A Core holding `threads`, the last the most recently touched. */
export function targetCore(threads: Array<Omit<Thread, "revision" | "touched">>): TargetCore {
  let clock = 0;
  let waiting: Array<() => void> = [];
  const core: TargetCore = {
    sent: [],
    threads: threads.map((thread) => ({ ...thread, revision: 1, touched: (clock += 1) })),
    hold: false,
    release() {
      const go = waiting;
      waiting = [];
      for (const resume of go) resume();
    },
    async request<T>(message: TestMessage): Promise<ChatResult<T>> {
      core.sent.push(message);
      const payload = answer(message);
      if (core.hold) await new Promise<void>((resolve) => waiting.push(resolve));
      return { ok: true, value: { ok: true, payload } as T };
    },
    thread: (conversationId) => core.threads.find((thread) => thread.conversationId === conversationId)
  };

  const record = (thread: Thread) => ({ conversationId: thread.conversationId, projectId: "project-1", revision: thread.revision, status: "open", subjectKind: thread.subjectKind, subjectId: thread.subjectId });

  function answer(message: TestMessage): unknown {
    if (message.type === TEST_MESSAGES.panelConversationRead && message.kind === "list") {
      const subjectId = message.subjectKind === "project" && message.subjectId === undefined ? "project-1" : message.subjectId;
      const matching = core.threads
        .filter((thread) => message.subjectKind === undefined || (thread.subjectKind === message.subjectKind && thread.subjectId === subjectId))
        .sort((a, b) => b.touched - a.touched);
      return { conversations: matching.slice(0, 1).map(record) };
    }
    if (message.type === TEST_MESSAGES.panelConversationRead) {
      const thread = core.thread(String(message.conversationId));
      if (!thread) return { conversation: null };
      return { conversation: { conversation: record(thread), turns: thread.turns.map((turn) => ({ ...turn, attachment: null, ask: turn.ask ?? null })), hasMore: false } };
    }
    if (message.type === TEST_MESSAGES.panelConversationSend) {
      let thread = typeof message.conversationId === "string" ? core.thread(message.conversationId) : undefined;
      let opened = false;
      if (!thread) {
        const subjectKind = typeof message.subjectKind === "string" ? message.subjectKind : "project";
        const subjectId = typeof message.subjectId === "string" ? message.subjectId : "project-1";
        thread = core.threads.find((candidate) => candidate.subjectKind === subjectKind && candidate.subjectId === subjectId);
        if (!thread) {
          thread = { conversationId: `conv-${core.threads.length + 1}`, subjectKind, subjectId, revision: 1, touched: 0, turns: [] };
          core.threads.push(thread);
        }
        opened = true;
      }
      thread.turns.push({ turnId: `${thread.conversationId}-t${thread.turns.length + 1}`, author: "person", text: String(message.text) });
      thread.revision += 1;
      thread.touched = clock += 1;
      return opened ? { conversation: record(thread) } : {};
    }
    if (message.type === TEST_MESSAGES.panelConversationAnswer) {
      for (const thread of core.threads) {
        const turn = thread.turns.find((candidate) => candidate.ask?.askId === message.askId);
        if (!turn?.ask) continue;
        turn.ask = { ...turn.ask, status: "answered", answer: { kind: String(message.kind), value: typeof message.value === "string" ? message.value : null } };
        thread.revision += 1;
        return { ask: turn.ask };
      }
    }
    return {};
  }

  return core;
}
