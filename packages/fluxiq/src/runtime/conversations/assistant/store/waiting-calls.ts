// The calls waiting on a person's Allow, in their panel database
// (`./migrations.ts`, `9002`, `9003`).
//
// A call is kept exactly as the card describes it, keyed by the card's ask, and
// taken once: `take` moves it from waiting to taken in one conditional update,
// so two presses that race (a double click, a retried request) cannot both run
// it. The second finds nothing waiting and runs nothing.
//
// Each keeps the words and the page and selection of the message it was raised
// under, so the work Allow goes on with is judged by what the person said then
// and where: "delete this" keeps meaning what was selected when they said it.
//
// Not on the change feed: nothing reads these rows but the press that takes one.

import type { JsonObject } from "../../../../core/index.ts";
import type { PanelAssistantContext } from "../types.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "../../../../framework/persistence/automation/index.ts";

/** A call kept for its card: the ask that carries the card, its thread, the tool by name and its exact input, and the words and place of the message it was raised under. */
export type PanelAssistantWaitingCall = { askId: string; conversationId: string; toolName: string; input: JsonObject; words: string; context: PanelAssistantContext };

type Row = { ask_id: string; conversation_id: string; tool_name: string; input_json: string; words: string; context_json: string };

export class PanelAssistantWaitingCalls {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  /** Opens the person's database. Its schema is brought up to date by the conversation store opened first (`./panel-threads.ts`). */
  static async open(input: { pool: AutomationStudioProjectDatabasePool; databaseId: string }): Promise<PanelAssistantWaitingCalls> {
    return new PanelAssistantWaitingCalls(await input.pool.acquire(input.databaseId));
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  /** Keeps a call for the card raised with `askId`. */
  async put(call: PanelAssistantWaitingCall, now: number): Promise<void> {
    await this.lease.database.run(
      "insert into panel_assistant_waiting_calls (ask_id, conversation_id, tool_name, input_json, words, context_json, status, created_at_ms, taken_at_ms) values (?, ?, ?, ?, ?, ?, 'waiting', ?, null)",
      [call.askId, call.conversationId, call.toolName, JSON.stringify(call.input), call.words, JSON.stringify(call.context), now]
    );
  }

  /** The call waiting on `askId`, now taken, or null when there is none or another press already took it. */
  async take(askId: string, now: number): Promise<PanelAssistantWaitingCall | null> {
    const taken = await this.lease.database.run("update panel_assistant_waiting_calls set status = 'taken', taken_at_ms = ? where ask_id = ? and status = 'waiting'", [now, askId]);
    if (taken.changes !== 1) return null;
    const row = await this.lease.database.get<Row>("select ask_id, conversation_id, tool_name, input_json, words, context_json from panel_assistant_waiting_calls where ask_id = ?", [askId]);
    if (!row) throw new Error(`The call waiting on ${askId} could not be read back.`);
    return { askId: row.ask_id, conversationId: row.conversation_id, toolName: row.tool_name, input: JSON.parse(row.input_json) as JsonObject, words: row.words, context: JSON.parse(row.context_json) as PanelAssistantContext };
  }

  /** Whether a call still waits on `askId`: what tells a card from any other ask in the thread. */
  async waiting(askId: string): Promise<boolean> {
    const row = await this.lease.database.get<{ status: string }>("select status from panel_assistant_waiting_calls where ask_id = ?", [askId]);
    return row?.status === "waiting";
  }
}
