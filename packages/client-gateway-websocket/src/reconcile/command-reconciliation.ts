// In-flight command reconciliation, the client's half of Core C8: a committing
// act in flight when the client's worker restarts or the socket drops must
// never read as "did not happen", and must never be made twice blindly.
//
// Duties, each on one moment of a command's life:
//
//  - **Before it is carried out**, a record is written (`begin`), refined with
//    where it was sent (`placed`), and cleared when its result is sent or
//    queued (`settled`).
//  - **After the next `session_ready`**, a record no running command of this
//    client owns is a command an earlier worker lost. It is reported as the
//    domain's interrupted result (`interruptedResult`) and cleared
//    (`reportLeftovers`).
//  - **A command id that comes again** is answered with what this client
//    already has for it instead of acting again (`answerRepeat`): nothing while
//    it is still running, since its own result will answer; the result just
//    sent; the result still waiting in the offline queue; or, for a record an
//    earlier worker left, the interrupted result.
//  - **Core asking what became of a command** whose answer never reached it
//    (`server.reconcile_command`) is answered from the same knowledge, and
//    never by acting (`reconcile`). An id answered `not_seen` is refused from
//    then on (`notSeenResult`), so a copy still on its way can never act after
//    Core has made the act again.
//
// Which acts commit and what an interrupted or never-received command is
// reported as are the domain's facts, handed in as dependencies.

import type { ClientGatewayActionResult, ClientGatewayReconcileAnswer } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "@fluxiq/contracts/core";
import { clientGatewayReconcileAnswer } from "./answer.ts";
import type { ClientGatewayInFlightRecordStore } from "./record-store.ts";
import type { ClientGatewaySeenCommandStore } from "./seen-store.ts";
import type { ClientGatewayCommandPlace, ClientGatewayInFlightRecord } from "./types.ts";

export type ClientGatewayCommandReconciliationDeps = {
  readonly store: ClientGatewayInFlightRecordStore;
  /** The result the offline queue holds for this command id, when it holds one. */
  readonly queuedResult: (commandId: string) => Promise<ClientGatewayActionResult | undefined>;
  /** Sends a result as `client.action_result`, or queues it while the socket is down. */
  readonly send: (result: ClientGatewayActionResult) => Promise<void>;
  /** Whether making this action is a committing act, in the domain's words. */
  readonly commits: (actionType: string, parameters: JsonObject | undefined) => boolean;
  /** The result reported for a command lost in flight, from its record. */
  readonly interruptedResult: (record: ClientGatewayInFlightRecord, completedAt: number) => ClientGatewayActionResult;
  /** The result a late copy of a command answered `not_seen` is refused with: it did not run, and never will. */
  readonly notSeenResult: (commandId: string, at: number) => ClientGatewayActionResult;
  /**
   * The ids this client has received, kept past their records. Absent, a
   * command whose result this client no longer holds and whose record is gone
   * reads as never received.
   */
  readonly seen?: ClientGatewaySeenCommandStore;
  readonly now?: () => number;
};

/** How a repeated command id was answered: still running here, its result sent again, or refused as one answered `not_seen`. */
export type ClientGatewayRepeatAnswer = "running" | "resent" | "refused";

/** How many results just sent are remembered, newest kept. */
const RECENT_RESULTS = 16;

/** How many ids answered `not_seen` are refused, newest kept. */
const DISOWNED_LIMIT = 64;

export class ClientGatewayCommandReconciliation {
  private readonly running = new Set<string>();
  private readonly recent = new Map<string, ClientGatewayActionResult>();
  private readonly disowned = new Set<string>();

  constructor(private readonly deps: ClientGatewayCommandReconciliationDeps) {}

  /** Records a command about to be carried out, before anything is sent on. Its parameters decide committing and are never kept. */
  async begin(command: { commandId: string; actionType: string; parameters?: JsonObject | undefined }, place?: ClientGatewayCommandPlace): Promise<void> {
    this.running.add(command.commandId);
    const record: ClientGatewayInFlightRecord = {
      commandId: command.commandId,
      actionType: command.actionType,
      committing: this.deps.commits(command.actionType, command.parameters),
      startedAt: this.now()
    };
    if (place !== undefined) record.place = { ...place };
    await this.deps.store.write(record);
    await this.deps.seen?.mark(command.commandId, record.startedAt);
  }

  /** Names where the command is being sent, just before it is; the place replaces any named before. */
  async placed(commandId: string, place: ClientGatewayCommandPlace): Promise<void> {
    const record = await this.deps.store.read(commandId);
    if (record === undefined) return;
    await this.deps.store.write({ ...record, place: { ...place } });
  }

  /** The command's result was sent or queued: its record is cleared, and the result remembered for a repeat. */
  async settled(result: ClientGatewayActionResult): Promise<void> {
    this.remember(result);
    this.running.delete(result.commandId);
    await this.deps.store.remove(result.commandId);
  }

  /**
   * The command stopped running here without a result (its handler threw). Its
   * record stays: nothing answered it, so a repeat, or the next worker, reports
   * it as interrupted rather than acting again.
   */
  release(commandId: string): void {
    this.running.delete(commandId);
  }

  /**
   * Answers a command id this client already has an answer for; `undefined`
   * means it is new and may run. A new id is claimed as running before the
   * first wait, so Core asking about it meanwhile hears `running`, never
   * `not_seen`.
   */
  async answerRepeat(commandId: string): Promise<ClientGatewayRepeatAnswer | undefined> {
    if (this.disowned.has(commandId)) {
      await this.deps.send(this.deps.notSeenResult(commandId, this.now()));
      return "refused";
    }
    if (this.running.has(commandId)) return "running";
    this.running.add(commandId);
    const answered = await this.answerFromKept(commandId);
    if (answered) this.running.delete(commandId);
    return answered ? "resent" : undefined;
  }

  /**
   * What became of a command, for Core (`server.reconcile_command`), from what
   * this client kept and never by running anything. A `not_seen` id is refused
   * from then on.
   */
  async reconcile(commandId: string): Promise<ClientGatewayReconcileAnswer> {
    if (this.disowned.has(commandId)) return clientGatewayReconcileAnswer(commandId, { running: false, recordLeft: false, seen: false });
    const running = this.running.has(commandId);
    const kept = running ? undefined : this.recent.get(commandId) ?? await this.deps.queuedResult(commandId);
    const recordLeft = running || kept !== undefined ? false : await this.deps.store.read(commandId) !== undefined;
    const seen = running || kept !== undefined || recordLeft ? true : await this.deps.seen?.has(commandId) ?? false;
    // A command that arrived during the reads above is running now, and is answered so.
    const answer = clientGatewayReconcileAnswer(commandId, { running: running || this.running.has(commandId), result: kept, recordLeft, seen });
    if (answer.state === "not_seen") this.disown(commandId);
    return answer;
  }

  /** Reports every record no running command owns -- a command an earlier worker lost -- and clears it. */
  async reportLeftovers(): Promise<number> {
    const leftovers = (await this.deps.store.all()).filter((record) => !this.running.has(record.commandId));
    for (const record of leftovers) await this.reportInterrupted(record);
    return leftovers.length;
  }

  private async answerFromKept(commandId: string): Promise<boolean> {
    const recent = this.recent.get(commandId);
    if (recent !== undefined) {
      await this.deps.send(recent);
      return true;
    }
    const left = await this.deps.store.read(commandId);
    if (left !== undefined) {
      await this.reportInterrupted(left);
      return true;
    }
    const queued = await this.deps.queuedResult(commandId);
    if (queued === undefined) return false;
    this.remember(queued);
    await this.deps.send(queued);
    return true;
  }

  private disown(commandId: string): void {
    this.disowned.add(commandId);
    while (this.disowned.size > DISOWNED_LIMIT) {
      const oldest = this.disowned.values().next().value;
      if (oldest === undefined) break;
      this.disowned.delete(oldest);
    }
  }

  private async reportInterrupted(record: ClientGatewayInFlightRecord): Promise<void> {
    const result = this.deps.interruptedResult(record, this.now());
    this.remember(result);
    await this.deps.send(result);
    await this.deps.store.remove(record.commandId);
  }

  private remember(result: ClientGatewayActionResult): void {
    this.recent.delete(result.commandId);
    this.recent.set(result.commandId, result);
    while (this.recent.size > RECENT_RESULTS) {
      const oldest = this.recent.keys().next().value;
      if (oldest === undefined) break;
      this.recent.delete(oldest);
    }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
