// The project store a conversation lives in.
//
// It follows the run-dataset store's shape exactly -- `static open({pool,
// projectId})` acquires a lease, migrates, and releases on failure -- but it
// sits here rather than in `storage/project/` because everything else about a
// conversation is here, and because a store under `storage/` that imported the
// conversation model out of `runtime/` would invert the dependency the rest of
// the program keeps.
//
// **Every write goes through the unit of work.** Not for idempotency alone:
// `recordChange` is what puts the write on the project change feed, and the
// change feed is the only channel by which a new turn reaches a reader that is
// not asking. A turn written straight to SQL would be invisible until someone
// reloaded the thread, which is the difference between a conversation and a log.

import {
  AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS,
  AutomationStudioProjectUnitOfWork,
  AutomationStudioSchemaMigrationRunner,
  automationStudioPageLimit,
  type AutomationStudioProjectDatabaseLease,
  type AutomationStudioProjectDatabasePool,
  type AutomationStudioProjectMutationContext,
  type AutomationStudioSqlExecutor
} from "../../storage/index.ts";
import { automationStudioConversationAnswerFits, type AutomationStudioConversationAsk, type AutomationStudioConversationAskInput } from "./ask.ts";
import {
  AUTOMATION_STUDIO_CONVERSATION_ASK_COLUMNS,
  AUTOMATION_STUDIO_CONVERSATION_COLUMNS,
  AUTOMATION_STUDIO_CONVERSATION_TURN_COLUMNS,
  automationStudioConversationAskFromRow,
  automationStudioConversationFromRow,
  automationStudioConversationTurnFromRow,
  type AutomationStudioConversationAskRow,
  type AutomationStudioConversationRow,
  type AutomationStudioConversationTurnRow
} from "./rows.ts";
import {
  AUTOMATION_STUDIO_CONVERSATION_ANSWER_VALUE_MAX,
  AUTOMATION_STUDIO_CONVERSATION_TITLE_MAX,
  automationStudioConversationAskOrRefuse,
  automationStudioConversationAttachmentOrRefuse,
  automationStudioConversationChangedAt,
  automationStudioConversationIdOrRefuse,
  automationStudioConversationShortTextOrRefuse,
  automationStudioConversationTextOrRefuse,
  type AutomationStudioConversationAnswerInput,
  type AutomationStudioConversationListInput,
  type AutomationStudioConversationOpenInput,
  type AutomationStudioConversationReadInput,
  type AutomationStudioConversationTurnInput
} from "./inputs.ts";
import type { AutomationStudioConversation, AutomationStudioConversationThread } from "./thread.ts";
import type { AutomationStudioConversationTurn } from "./turn.ts";

/** The refusal a second, different answer gets. Named so a caller can recognise it without matching prose. */
export const AUTOMATION_STUDIO_CONVERSATION_ASK_ANSWERED = "This question has already been answered.";

export class AutomationStudioProjectConversationStore {
  private constructor(
    private readonly lease: AutomationStudioProjectDatabaseLease,
    private readonly unit: AutomationStudioProjectUnitOfWork
  ) {}

  /** Opens the project database and brings its schema up to date; throws when the store cannot be opened. */
  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectConversationStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectConversationStore(lease, await AutomationStudioProjectUnitOfWork.open(input));
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.unit.close();
    } finally {
      await this.lease.release();
    }
  }

  /**
   * Opens a thread, or returns the one this `conversationId` already names.
   * Re-opening is the same mutation replayed, so a caller that does not
   * remember whether it opened the thread may simply open it again.
   */
  async openConversation(input: AutomationStudioConversationOpenInput): Promise<AutomationStudioConversation> {
    const conversationId = automationStudioConversationIdOrRefuse(input.conversationId, "conversation");
    const subjectId = automationStudioConversationIdOrRefuse(input.subjectId, "conversation subject");
    const title = automationStudioConversationShortTextOrRefuse(input.title ?? null, "Conversation title", AUTOMATION_STUDIO_CONVERSATION_TITLE_MAX);
    const result = await this.unit.runIdempotent(
      {
        mutationId: automationStudioConversationIdOrRefuse(input.mutationId, "mutation"),
        operationKind: "conversation.open",
        ownerKind: "conversation",
        ownerId: conversationId,
        request: { conversationId, subjectKind: input.subjectKind, subjectId, title },
        ...automationStudioConversationChangedAt(input.changedAt)
      },
      async (context) => {
        const existing = await readConversation(context.sql, conversationId);
        if (existing) return existing;
        await context.sql.run(
          "insert into conversations (conversation_id, subject_kind, subject_id, status, title, revision, turn_count, pending_ask_count, created_at_ms, updated_at_ms) values (?, ?, ?, 'open', ?, 1, 0, 0, ?, ?)",
          [conversationId, input.subjectKind, subjectId, title, context.changedAt, context.changedAt]
        );
        await context.recordChange({ entityKind: "conversation", entityId: conversationId, operation: "create", revision: 1 });
        return requireConversation(await readConversation(context.sql, conversationId), conversationId);
      }
    );
    return automationStudioConversationFromRow(this.lease.projectId, result.response);
  }

  /**
   * Appends one turn, and the ask it carries, in one transaction. The turn's
   * ordinal is the thread's turn count plus one, so two writers racing on the
   * same thread cannot both take it: the unique index refuses the second, and
   * the whole turn rolls back rather than landing out of order.
   */
  async appendTurn(input: AutomationStudioConversationTurnInput): Promise<AutomationStudioConversationTurn> {
    const conversationId = automationStudioConversationIdOrRefuse(input.conversationId, "conversation");
    const turnId = automationStudioConversationIdOrRefuse(input.turnId, "turn");
    const text = automationStudioConversationTextOrRefuse(input.text);
    const actorId = input.actorId === null || input.actorId === undefined ? null : automationStudioConversationIdOrRefuse(input.actorId, "actor");
    const attachment = automationStudioConversationAttachmentOrRefuse(input.attachment ?? null);
    const ask = automationStudioConversationAskOrRefuse(input.ask ?? null);
    const result = await this.unit.runIdempotent(
      {
        mutationId: automationStudioConversationIdOrRefuse(input.mutationId, "mutation"),
        operationKind: "conversation.turn.append",
        ownerKind: "conversation",
        ownerId: conversationId,
        request: { conversationId, turnId, author: input.author, text, actorId, attachment, ask },
        ...automationStudioConversationChangedAt(input.changedAt)
      },
      async (context) => {
        const conversation = requireConversation(await readConversation(context.sql, conversationId), conversationId);
        const ordinal = conversation.turn_count + 1;
        await context.sql.run(
          "insert into conversation_turns (conversation_id, turn_id, ordinal, author, body, attachment_kind, attachment_ref, actor_id, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [conversationId, turnId, ordinal, input.author, text, attachment === null ? null : attachment.kind, attachment === null ? null : attachment.ref, actorId, context.changedAt]
        );
        if (ask) await insertAsk(context.sql, { ask, conversationId, turnId, createdAt: context.changedAt });
        // The turn's own change goes on the feed first, then the thread's: a
        // reader that follows the feed in order sees what was said before it
        // sees that the thread moved.
        await context.recordChange({ entityKind: "conversation_turn", entityId: turnId, operation: "create", revision: ordinal });
        await bumpThread(context, { conversationId, revision: conversation.revision + 1, turnCount: ordinal, pendingAskDelta: ask ? 1 : 0 });
        return automationStudioConversationTurnFromRow(
          requireTurn(await readTurn(context.sql, conversationId, turnId), turnId),
          ask ? automationStudioConversationAskFromRow(requireAsk(await readAsk(context.sql, ask.askId), ask.askId)) : null
        );
      }
    );
    return result.response;
  }

  /**
   * Settles one ask. An ask is answered once: a second answer that says
   * anything different is refused here, and an exact resend of the same answer
   * replays the first through the mutation record rather than writing again.
   */
  async answerAsk(input: AutomationStudioConversationAnswerInput): Promise<AutomationStudioConversationAsk> {
    const askId = automationStudioConversationIdOrRefuse(input.askId, "conversation ask");
    const value = automationStudioConversationShortTextOrRefuse(input.value ?? null, "Answer value", AUTOMATION_STUDIO_CONVERSATION_ANSWER_VALUE_MAX);
    const actorId = input.actorId === null || input.actorId === undefined ? null : automationStudioConversationIdOrRefuse(input.actorId, "actor");
    const result = await this.unit.runIdempotent(
      {
        mutationId: automationStudioConversationIdOrRefuse(input.mutationId, "mutation"),
        operationKind: "conversation.ask.answer",
        ownerKind: "conversation_ask",
        ownerId: askId,
        request: { askId, kind: input.kind, value },
        ...automationStudioConversationChangedAt(input.changedAt)
      },
      async (context) => {
        const row = requireAsk(await readAsk(context.sql, askId), askId);
        if (row.status !== "pending") throw new Error(AUTOMATION_STUDIO_CONVERSATION_ASK_ANSWERED);
        if (!automationStudioConversationAnswerFits(row.kind, input.kind)) throw new Error(`A ${input.kind} answer does not settle a ${row.kind} question.`);
        const pending = automationStudioConversationAskFromRow(row);
        if (pending.kind === "choice" && !(pending.options ?? []).some((option) => option.id === value)) throw new Error("An answer to a choice must name one of its options.");
        const conversation = requireConversation(await readConversation(context.sql, row.conversation_id), row.conversation_id);
        const revision = conversation.revision + 1;
        await context.sql.run("update conversation_asks set status = 'answered', answered_at_ms = ?, answer_kind = ?, answer_value = ?, answer_actor_id = ? where ask_id = ? and status = 'pending'", [
          context.changedAt,
          input.kind,
          value,
          actorId,
          askId
        ]);
        await context.recordChange({ entityKind: "conversation_ask", entityId: askId, operation: "update", revision });
        await bumpThread(context, { conversationId: row.conversation_id, revision, turnCount: conversation.turn_count, pendingAskDelta: -1 });
        return automationStudioConversationAskFromRow(requireAsk(await readAsk(context.sql, askId), askId));
      }
    );
    return result.response;
  }

  /**
   * Closes an ask nobody answered in time.
   *
   * Expiry is a clock event, not a person's act, so this never refuses: an ask
   * already answered or already expired comes back as it stands and the clock
   * has simply lost. That is deliberate and it is what makes the race safe --
   * whoever waited for this ask asks the store to close it at the deadline,
   * and if the answer landed first the store hands the answer back instead of
   * a timeout, so an ask can never be both answered and timed out.
   */
  async expireAsk(input: { mutationId: string; askId: string; changedAt?: number }): Promise<AutomationStudioConversationAsk> {
    const askId = automationStudioConversationIdOrRefuse(input.askId, "conversation ask");
    const result = await this.unit.runIdempotent(
      {
        mutationId: automationStudioConversationIdOrRefuse(input.mutationId, "mutation"),
        operationKind: "conversation.ask.expire",
        ownerKind: "conversation_ask",
        ownerId: askId,
        request: { askId },
        ...automationStudioConversationChangedAt(input.changedAt)
      },
      async (context) => {
        const row = requireAsk(await readAsk(context.sql, askId), askId);
        if (row.status !== "pending") return automationStudioConversationAskFromRow(row);
        const conversation = requireConversation(await readConversation(context.sql, row.conversation_id), row.conversation_id);
        const revision = conversation.revision + 1;
        await context.sql.run("update conversation_asks set status = 'expired' where ask_id = ? and status = 'pending'", [askId]);
        await context.recordChange({ entityKind: "conversation_ask", entityId: askId, operation: "update", revision });
        await bumpThread(context, { conversationId: row.conversation_id, revision, turnCount: conversation.turn_count, pendingAskDelta: -1 });
        return automationStudioConversationAskFromRow(requireAsk(await readAsk(context.sql, askId), askId));
      }
    );
    return result.response;
  }

  /** The project's threads, most recently touched first, narrowed by subject or status. */
  async listConversations(input: AutomationStudioConversationListInput = {}): Promise<AutomationStudioConversation[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input.subjectKind !== undefined) {
      clauses.push("subject_kind = ?");
      values.push(input.subjectKind);
    }
    if (input.subjectId !== undefined) {
      clauses.push("subject_id = ?");
      values.push(automationStudioConversationIdOrRefuse(input.subjectId, "conversation subject"));
    }
    if (input.status !== undefined) {
      clauses.push("status = ?");
      values.push(input.status);
    }
    const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
    const rows = await this.lease.database.all<AutomationStudioConversationRow>(
      `select ${AUTOMATION_STUDIO_CONVERSATION_COLUMNS} from conversations${where} order by updated_at_ms desc, conversation_id limit ?`,
      [...values, automationStudioPageLimit(input.limit)]
    );
    return rows.map((row) => automationStudioConversationFromRow(this.lease.projectId, row));
  }

  /**
   * One thread and its turns, or null when the project holds no such thread.
   * With `sinceTurnId` only what followed that turn is read, which is what a
   * reader already holding the thread asks for. An unknown `sinceTurnId` is
   * refused rather than read as "from the start": answering it with the whole
   * thread would look exactly like a thread that had been rewritten.
   */
  async getConversation(input: AutomationStudioConversationReadInput): Promise<AutomationStudioConversationThread | null> {
    const conversationId = automationStudioConversationIdOrRefuse(input.conversationId, "conversation");
    const row = await readConversation(this.lease.database, conversationId);
    if (!row) return null;
    const limit = automationStudioPageLimit(input.limit);
    let since = 0;
    if (input.sinceTurnId !== undefined) {
      const sinceTurnId = automationStudioConversationIdOrRefuse(input.sinceTurnId, "turn");
      const turn = await readTurn(this.lease.database, conversationId, sinceTurnId);
      if (!turn) throw new Error(`Unknown conversation turn: ${sinceTurnId}`);
      since = turn.ordinal;
    }
    const turnRows = await this.lease.database.all<AutomationStudioConversationTurnRow>(
      `select ${AUTOMATION_STUDIO_CONVERSATION_TURN_COLUMNS} from conversation_turns where conversation_id = ? and ordinal > ? order by ordinal limit ?`,
      [conversationId, since, limit + 1]
    );
    const page = turnRows.slice(0, limit);
    const asks = await this.readAsksFor(conversationId, page);
    return {
      conversation: automationStudioConversationFromRow(this.lease.projectId, row),
      turns: page.map((turn) => automationStudioConversationTurnFromRow(turn, asks.get(turn.turn_id) ?? null)),
      hasMore: turnRows.length > limit
    };
  }

  /** One turn by id, or null when the thread does not hold it. */
  async getTurn(conversationId: string, turnId: string): Promise<AutomationStudioConversationTurn | null> {
    const id = automationStudioConversationIdOrRefuse(conversationId, "conversation");
    const row = await readTurn(this.lease.database, id, automationStudioConversationIdOrRefuse(turnId, "turn"));
    if (!row) return null;
    const asks = await this.readAsksFor(id, [row]);
    return automationStudioConversationTurnFromRow(row, asks.get(row.turn_id) ?? null);
  }

  /** One ask by id, or null when the project holds no such ask. */
  async getAsk(askId: string): Promise<AutomationStudioConversationAsk | null> {
    const row = await readAsk(this.lease.database, automationStudioConversationIdOrRefuse(askId, "conversation ask"));
    return row ? automationStudioConversationAskFromRow(row) : null;
  }

  private async readAsksFor(conversationId: string, turns: readonly AutomationStudioConversationTurnRow[]): Promise<Map<string, AutomationStudioConversationAsk>> {
    const asks = new Map<string, AutomationStudioConversationAsk>();
    if (!turns.length) return asks;
    const placeholders = turns.map(() => "?").join(", ");
    const rows = await this.lease.database.all<AutomationStudioConversationAskRow>(
      `select ${AUTOMATION_STUDIO_CONVERSATION_ASK_COLUMNS} from conversation_asks where conversation_id = ? and turn_id in (${placeholders})`,
      [conversationId, ...turns.map((turn) => turn.turn_id)]
    );
    for (const row of rows) asks.set(row.turn_id, automationStudioConversationAskFromRow(row));
    return asks;
  }
}

async function bumpThread(context: AutomationStudioProjectMutationContext, input: { conversationId: string; revision: number; turnCount: number; pendingAskDelta: number }): Promise<void> {
  await context.sql.run("update conversations set turn_count = ?, pending_ask_count = max(0, pending_ask_count + ?), revision = ?, updated_at_ms = ? where conversation_id = ?", [
    input.turnCount,
    input.pendingAskDelta,
    input.revision,
    context.changedAt,
    input.conversationId
  ]);
  await context.recordChange({ entityKind: "conversation", entityId: input.conversationId, operation: "update", revision: input.revision });
}

async function insertAsk(sql: AutomationStudioSqlExecutor, input: { ask: AutomationStudioConversationAskInput; conversationId: string; turnId: string; createdAt: number }): Promise<void> {
  const ask = input.ask;
  await sql.run(
    "insert into conversation_asks (ask_id, conversation_id, turn_id, kind, status, parks, timeout_ms, on_timeout, options_json, routes_json, consequences_json, missing_json, control_json, request_json, created_at_ms, answered_at_ms, answer_kind, answer_value, answer_actor_id) values (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, null, null)",
    [
      ask.askId,
      input.conversationId,
      input.turnId,
      ask.kind,
      ask.parks ? 1 : 0,
      ask.timeoutMs ?? null,
      ask.onTimeout ?? null,
      ask.options ? JSON.stringify(ask.options.map((option) => ({ id: option.id, label: option.label, route: option.route ?? null }))) : null,
      ask.routes ? JSON.stringify({ granted: ask.routes.granted, denied: ask.routes.denied, timedOut: ask.routes.timedOut }) : null,
      ask.consequences ? JSON.stringify(ask.consequences) : null,
      ask.missing ? JSON.stringify(ask.missing) : null,
      ask.control ? JSON.stringify({ name: ask.control.name, kind: ask.control.kind }) : null,
      ask.permissionRequest ? JSON.stringify(ask.permissionRequest) : null,
      input.createdAt
    ]
  );
}

function readConversation(sql: AutomationStudioSqlExecutor, conversationId: string): Promise<AutomationStudioConversationRow | undefined> {
  return sql.get<AutomationStudioConversationRow>(`select ${AUTOMATION_STUDIO_CONVERSATION_COLUMNS} from conversations where conversation_id = ?`, [conversationId]);
}

function readTurn(sql: AutomationStudioSqlExecutor, conversationId: string, turnId: string): Promise<AutomationStudioConversationTurnRow | undefined> {
  return sql.get<AutomationStudioConversationTurnRow>(`select ${AUTOMATION_STUDIO_CONVERSATION_TURN_COLUMNS} from conversation_turns where conversation_id = ? and turn_id = ?`, [conversationId, turnId]);
}

function readAsk(sql: AutomationStudioSqlExecutor, askId: string): Promise<AutomationStudioConversationAskRow | undefined> {
  return sql.get<AutomationStudioConversationAskRow>(`select ${AUTOMATION_STUDIO_CONVERSATION_ASK_COLUMNS} from conversation_asks where ask_id = ?`, [askId]);
}

function requireConversation(row: AutomationStudioConversationRow | undefined, conversationId: string): AutomationStudioConversationRow {
  if (!row) throw new Error(`Unknown conversation: ${conversationId}`);
  return row;
}

function requireTurn(row: AutomationStudioConversationTurnRow | undefined, turnId: string): AutomationStudioConversationTurnRow {
  if (!row) throw new Error(`Unknown conversation turn: ${turnId}`);
  return row;
}

function requireAsk(row: AutomationStudioConversationAskRow | undefined, askId: string): AutomationStudioConversationAskRow {
  if (!row) throw new Error(`Unknown conversation ask: ${askId}`);
  return row;
}
