// Test support: a fake FluxIQ Core with one thread of raw turn records, so a
// turn can carry an ask or an attachment as Core writes them. It records every
// send and answer as the port got it, and a test sets what an answer comes to.
// Nothing in production code imports this.

import type { ChatAnswer, ChatResult, ChatSend, ChatTransport } from "../ports/index.ts";
import { relayState } from "./activity-fixture.ts";

export type AsksCore = {
  /** The thread's turns, as Core's records. */
  turns: Array<Record<string, unknown>>;
  sends: ChatSend[];
  answers: ChatAnswer[];
  /** How many times the thread was read. */
  reads: number;
  /** What the next answers come to (a function sees the answer). */
  answerResult: (answer: ChatAnswer) => ChatResult<unknown>;
  sendResult: ChatResult<{ conversation?: unknown; problem?: string }> | undefined;
  /** Makes the next read see a new revision. */
  touch(): void;
  transport(): ChatTransport;
};

/** A turn record the way Core writes it, with `fields` over it. */
export function coreTurn(turnId: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { turnId, author: "automation", text: `words of ${turnId}`, ask: null, createdAt: 1_700_000_000_000, ...fields };
}

/** A pending ask record of `kind`. */
export function coreAsk(askId: string, kind = "permission", fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { askId, kind, status: "pending", options: null, answer: null, ...fields };
}

export function asksCore(turns: Array<Record<string, unknown>>): AsksCore {
  let version = 0;
  const core: AsksCore = {
    turns,
    sends: [],
    answers: [],
    reads: 0,
    answerResult: () => ({ ok: true, value: {} }),
    sendResult: undefined,
    touch: () => { version += 1; },
    transport() {
      const conversation = () => ({ conversationId: "conv-1", projectId: "project-1", revision: core.turns.length + version, status: "open", updatedAt: 1, pendingAskCount: 0, title: null, subject: { kind: "project" } });
      return {
        conversation: {
          listThreads: async () => ({ ok: true, value: { conversations: [conversation()] } }),
          readThread: async (query) => {
            core.reads += 1;
            const from = query.sinceTurnId === undefined ? 0 : core.turns.findIndex((turn) => turn.turnId === query.sinceTurnId) + 1;
            const page = core.turns.slice(from, from + query.limit);
            return { ok: true, value: { conversation: { conversation: conversation(), turns: page, hasMore: from + query.limit < core.turns.length } } };
          },
          send: async (message) => {
            core.sends.push(message);
            return core.sendResult ?? { ok: true, value: {} };
          },
          answer: async (answer) => {
            core.answers.push(answer);
            const result = core.answerResult(answer);
            if (result.ok) {
              const turn = core.turns.find((candidate) => (candidate.ask as { askId?: string } | null)?.askId === answer.askId);
              if (turn !== undefined) turn.ask = { ...(turn.ask as object), status: "answered", answer: { kind: answer.kind, value: answer.value ?? null } };
              version += 1;
            }
            return result;
          }
        },
        activity: { read: async () => ({ ok: true, value: { state: relayState([]) } }), subscribe: () => () => undefined },
        runs: {
          stop: async () => ({ ok: true, value: {} }),
          takeOver: async () => ({ ok: true, value: undefined }),
          handBack: async () => ({ ok: true, value: undefined })
        }
      };
    }
  };
  return core;
}
