// A fake FluxIQ Core behind the background's conversation relays, for the
import { TEST_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";
// controller and thread-tail tests. It answers `PanelStore.request` the way
// `panelRequest` would for the relay's `{ ok: true, payload }` replies, pages
// `get-conversation` forward from `sinceTurnId` as Core does, and records every
// message it was sent.


export type FakeTurn = { turnId: string; author: "person" | "automation"; text: string; ask?: Record<string, unknown> | null };

export type FakeCore = {
  sent: TestMessage[];
  turns: FakeTurn[];
  revision: number;
  /** When set, the next matching request answers this instead. */
  failNext: Map<string, ChatResult<unknown>>;
  /** No thread at all until a first message opens one. */
  exists: boolean;
  request<T>(message: TestMessage): Promise<ChatResult<T>>;
  say(author: FakeTurn["author"], text: string, ask?: Record<string, unknown>): FakeTurn;
};

export const UNSUPPORTED: ChatResult<unknown> = { ok: false, sentence: "This extension doesn't support that yet.", unsupported: true };
export const UNREACHABLE: ChatResult<unknown> = { ok: false, sentence: "Something went wrong.", detail: "FluxIQ could not be reached." };
export const REFUSED: ChatResult<unknown> = { ok: false, sentence: "FluxIQ didn't accept this browser.", detail: "401 Unauthorized", code: "refused" };

/** A Core with one open thread holding `turnCount` turns, or none. */
export function fakeCore(turnCount: number, exists = true): FakeCore {
  const core: FakeCore = {
    sent: [],
    turns: [],
    revision: 1,
    failNext: new Map(),
    exists,
    async request<T>(message: TestMessage): Promise<ChatResult<T>> {
      core.sent.push(message);
      const key = `${message.type}:${String(message.kind ?? "")}`;
      const failure = core.failNext.get(key) ?? core.failNext.get(message.type);
      if (failure) {
        core.failNext.delete(key);
        core.failNext.delete(message.type);
        return failure as ChatResult<T>;
      }
      return { ok: true, value: { ok: true, payload: answer(message) } as T };
    },
    say(author, text, ask) {
      const turn: FakeTurn = { turnId: `turn-${core.turns.length + 1}`, author, text, ask: ask ?? null };
      core.turns.push(turn);
      core.revision += 1;
      return turn;
    }
  };
  for (let index = 0; index < turnCount; index += 1) core.say(index % 2 === 0 ? "person" : "automation", `message ${index + 1}`);

  const conversation = () => ({ conversationId: "conv-1", projectId: "project-1", revision: core.revision, status: "open" });
  const turnRecord = (turn: FakeTurn) => ({ ...turn, conversationId: "conv-1", ordinal: Number(turn.turnId.slice(5)), attachment: null });

  function answer(message: TestMessage): unknown {
    if (message.type === TEST_MESSAGES.panelConversationRead && message.kind === "list") {
      return { conversations: core.exists ? [conversation()] : [] };
    }
    if (message.type === TEST_MESSAGES.panelConversationRead) {
      const since = typeof message.sinceTurnId === "string" ? core.turns.findIndex((turn) => turn.turnId === message.sinceTurnId) + 1 : 0;
      const limit = typeof message.limit === "number" ? message.limit : 50;
      const page = core.turns.slice(since, since + limit);
      return { conversation: { conversation: conversation(), turns: page.map(turnRecord), hasMore: since + limit < core.turns.length } };
    }
    if (message.type === TEST_MESSAGES.panelConversationSend) {
      const opened = !core.exists;
      core.exists = true;
      const turn = core.say("person", String(message.text));
      core.say("automation", `Working on: ${String(message.text)}`);
      return opened ? { conversation: conversation(), turn: turnRecord(turn) } : { turn: turnRecord(turn) };
    }
    if (message.type === TEST_MESSAGES.panelConversationAnswer) {
      const turn = core.turns.find((candidate) => candidate.ask?.askId === message.askId);
      if (turn?.ask) turn.ask = { ...turn.ask, status: "answered", answer: { kind: message.kind, value: message.value ?? null } };
      core.revision += 1;
      return { ask: turn?.ask ?? null };
    }
    return {};
  }

  return core;
}
