// The parts of FluxIQ Core's conversation records this card reads, and a
// reader for each that checks the shape instead of trusting it.
//
// The records are Core's (`automation-studio/runtime/conversations/`
// `thread.ts`, `turn.ts`, `ask.ts`); the background relays them unchanged, so
// a Core that answers with something else is a failed read (`unreadable`,
// `read/failure.ts`), retried and then named in the chat's notice, never a
// blank card or a thrown error. Only the fields shown here are read; the rest
// of each record is ignored.

/** A thread, as `list-conversations` names it. */
export type CoreConversation = { conversationId: string; projectId: string; revision: number };

/** One option of a choice question. */
export type CoreAskOption = { id: string; label: string };

/** A question FluxIQ asked in a turn, and its answer once there is one. */
export type CoreAsk = {
  askId: string;
  /** `permission`, `choice`, `confirm` or `open` in today's Core. */
  kind: string;
  /** `pending`, `answered` or `expired`. */
  status: string;
  options: CoreAskOption[] | null;
  answer: { kind: string; value: string | null } | null;
};

/** One turn: who said it, what they said, and what it asks or shows. */
export type CoreTurn = {
  turnId: string;
  /** `person` or `automation`. */
  author: string;
  text: string;
  ask: CoreAsk | null;
  /** When Core wrote it, in ms since the epoch, on Core's clock: the clock its live activity is stamped with. */
  createdAt?: number;
  /**
   * Never from Core: set by this panel on the person's message it is still
   * sending, or could not send (`controller.ts`), and says why it did not go.
   */
  sendError?: string | undefined;
};

/** A page of a thread, as `get-conversation` answers it. */
export type CoreThreadPage = { conversation: CoreConversation; turns: CoreTurn[]; hasMore: boolean };

/** `value` as a conversation, or undefined when it is not one. */
export function parseConversation(value: unknown): CoreConversation | undefined {
  const record = asRecord(value);
  if (!record || !isText(record.conversationId) || !isText(record.projectId) || typeof record.revision !== "number") return undefined;
  return { conversationId: record.conversationId, projectId: record.projectId, revision: record.revision };
}

/**
 * `get-conversation`'s `conversation` field as a page: null when Core says the
 * thread does not exist, undefined when the answer is not a thread at all.
 */
export function parseThreadPage(value: unknown): CoreThreadPage | null | undefined {
  if (value === null) return null;
  const record = asRecord(value);
  const conversation = parseConversation(record?.conversation);
  if (!record || !conversation || !Array.isArray(record.turns)) return undefined;
  const turns: CoreTurn[] = [];
  for (const raw of record.turns) {
    const turn = parseTurn(raw);
    if (!turn) return undefined;
    turns.push(turn);
  }
  return { conversation, turns, hasMore: record.hasMore === true };
}

function parseTurn(value: unknown): CoreTurn | undefined {
  const record = asRecord(value);
  if (!record || !isText(record.turnId) || typeof record.author !== "string" || typeof record.text !== "string") return undefined;
  return {
    turnId: record.turnId,
    author: record.author,
    text: record.text,
    ask: parseAsk(record.ask),
    ...(typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? { createdAt: record.createdAt } : {})
  };
}

function parseAsk(value: unknown): CoreAsk | null {
  const record = asRecord(value);
  if (!record || !isText(record.askId) || typeof record.kind !== "string" || typeof record.status !== "string") return null;
  const options = Array.isArray(record.options)
    ? record.options.flatMap((raw) => {
      const option = asRecord(raw);
      return option && isText(option.id) && typeof option.label === "string" ? [{ id: option.id, label: option.label }] : [];
    })
    : null;
  const answer = asRecord(record.answer);
  return {
    askId: record.askId,
    kind: record.kind,
    status: record.status,
    options,
    answer: answer && typeof answer.kind === "string"
      ? { kind: answer.kind, value: typeof answer.value === "string" ? answer.value : null }
      : null
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
