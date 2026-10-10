import { randomUUID } from "node:crypto";
import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResponse,
  ClientGatewayActionResult,
  ClientGatewayReconcileAnswer
} from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../core/index.ts";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import { COMMAND_ANSWER_MARGIN_MS } from "./command-answer-margin.ts";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { PendingCommand } from "./types.ts";
import { ClientGatewayCommandContext, ClientGatewayDurableDispatch, type ClientGatewayDurableActionOptions, type ClientGatewayDurableActionResponse } from "./command-ledger/index.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayServiceOptions } from "./types.ts";
import type { ClientGatewayActionResultReading } from "./action-result-reading.ts";
import { ClientGatewayCommandHistory, type ClientGatewayLateActionResult, type ClientGatewayLateActionResultListener } from "./command-history.ts";
import { ClientGatewayCommandReconciler, clientGatewayReconciledResult } from "./command-reconcile/index.ts";

/** What became of a client's action result. `late`: it answered a command Core no longer awaited, and went to the run's evidence. */
export type ClientGatewayResultDisposition = "settled" | "unknown_command" | "wrong_session" | "suppressed" | "late";

type CommandCollaborators = {
  config: ClientGatewayConfig;
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  resolveCommandLedger?: ClientGatewayServiceOptions["resolveCommandLedger"];
  commandOwner?: ClientGatewayServiceOptions["commandOwner"];
};

/**
 * Everything the server asks a paired client to do, plus the pending-command
 * table that matches an action result back to the caller waiting on it.
 */
export class ClientGatewayCommands {
  private readonly pending = new Map<string, PendingCommand>();
  private readonly durable: ClientGatewayDurableDispatch;
  private readonly history: ClientGatewayCommandHistory;
  private readonly reconciler: ClientGatewayCommandReconciler;
  private readonly commandOwner: ClientGatewayServiceOptions["commandOwner"];
  private closed = false;
  private readonly config: ClientGatewayConfig;
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;

  constructor(collaborators: CommandCollaborators) {
    this.config = collaborators.config;
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.durable = new ClientGatewayDurableDispatch({ ...collaborators, ...(collaborators.resolveCommandLedger ? { resolve: collaborators.resolveCommandLedger } : {}) });
    this.history = new ClientGatewayCommandHistory(collaborators.config.now);
    this.reconciler = new ClientGatewayCommandReconciler({ sessions: this.sessions, transport: this.transport, audit: this.audit, answerMs: collaborators.config.reconcileAnswerMs });
    this.commandOwner = collaborators.commandOwner;
  }

  async startRecording(sessionId: string, input: { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string }): Promise<void> {
    const session = this.sessions.requireReady(sessionId);
    session.activeRecordingId = input.recordingId;
    if (input.projectId !== undefined) session.projectId = input.projectId;
    await this.transport.send(sessionId, this.transport.message("server.start_recording", input, session));
  }

  async stopRecording(sessionId: string, recordingId?: string): Promise<void> {
    const session = this.sessions.requireReady(sessionId);
    const payload = recordingId ?? session.activeRecordingId ? { recordingId: recordingId ?? session.activeRecordingId ?? "" } : {};
    await this.transport.send(sessionId, this.transport.message("server.stop_recording", payload, session));
    session.activeRecordingId = null;
  }

  async captureSnapshot(sessionId: string, input: { kind?: string; metadata?: JsonObject } = {}): Promise<void> {
    const session = this.sessions.requireReady(sessionId);
    await this.transport.send(sessionId, this.transport.message("server.capture_snapshot", {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    }, session));
  }

  executeAction(sessionId: string, command: ClientGatewayActionCommand): ClientGatewayActionResponse;
  executeAction(sessionId: string, command: ClientGatewayActionCommand, options: ClientGatewayDurableActionOptions): ClientGatewayDurableActionResponse;
  executeAction(sessionId: string, command: ClientGatewayActionCommand, options?: ClientGatewayDurableActionOptions): ClientGatewayActionResponse | ClientGatewayDurableActionResponse {
    if (this.closed) throw new Error("client_gateway.closed");
    if (arguments.length > 2) return this.executeDurable(sessionId, command, options!);
    const session = this.sessions.requireReady(sessionId);
    const commandId = randomUUID();
    this.history.opened({ commandId, sessionId, clientId: session.clientId, actionType: command.actionType, durable: false, owner: this.readOwner() });
    const message = this.transport.message("server.execute_action", { ...command, commandId }, session);
    // The client is sent the command's own timeout, unchanged, and reports its
    // own timeout when that runs out; waiting only as long would discard that
    // answer, so a sent timeout is waited on for the answer margin longer.
    const waitMs = command.timeoutMs === undefined ? this.config.commandTimeoutMs : command.timeoutMs + COMMAND_ANSWER_MARGIN_MS;
    const result = new Promise<ClientGatewayActionResult>((resolve) => {
      const timeout = setTimeout(() => void this.answerNeverCame(commandId, waitMs), waitMs);
      this.pending.set(commandId, { sessionId, resolve, timeout });
    });
    void this.transport.send(sessionId, message);
    this.audit.record("command.dispatched", "Action command dispatched to client.", { sessionId, commandId, actionType: command.actionType });
    return { commandId, message, result };
  }

  /**
   * Bind a pending answer to its dispatched session before changing any state.
   * A result for a command this gateway sent but no longer awaits is late: it
   * resolves nothing, and goes to the late-result listeners instead.
   */
  async settle(senderSessionId: string, reading: ClientGatewayActionResultReading): Promise<ClientGatewayResultDisposition> {
    const result = reading.result;
    if (this.durable.has(result?.commandId)) return await this.durable.settle(senderSessionId, result);
    const pending = this.pending.get(result.commandId);
    if (!pending) return await this.settleLate(senderSessionId, reading);
    if (pending.sessionId !== senderSessionId) return "wrong_session";
    clearTimeout(pending.timeout);
    this.pending.delete(result.commandId);
    this.history.closed(result.commandId, "settled");
    pending.resolve(result);
    return "settled";
  }

  /**
   * Asks the client a command was sent to what became of it (C8, B3): answered
   * from what the client kept, never by acting. `undefined` when no session of
   * that client answers such a question, or the command is not one this
   * gateway remembers sending.
   */
  async reconcileAction(commandId: string): Promise<ClientGatewayReconcileAnswer | undefined> {
    const route = this.history.route(commandId);
    return route ? await this.reconciler.reconcile(route, commandId) : undefined;
  }

  /** A client's answer to `server.reconcile_command`; false when nobody asked it that. */
  answerReconcile(senderSessionId: string, payload: unknown): boolean {
    return this.reconciler.answer(this.sessions.require(senderSessionId).clientId, payload);
  }

  /** Listens for results that arrive after Core stopped waiting for their command. */
  onLateActionResult(listener: ClientGatewayLateActionResultListener): () => void {
    return this.history.onLate(listener);
  }

  isDurableCommand(commandId: string): boolean { return this.durable.has(commandId); }
  async close(): Promise<void> {
    this.closed = true;
    this.reconciler.abandonAll();
    for (const [commandId, pending] of this.pending) {
      clearTimeout(pending.timeout);
      this.history.closed(commandId, "closed");
      pending.resolve({ commandId, status: "unknown", message: "Client gateway closed before an answer." });
    }
    this.pending.clear();
    await this.durable.drain();
  }

  /**
   * The wait for a command's answer ran out. Before calling it timed out, the
   * client it went to is asked what became of it, by command id: its kept
   * result settles the command as if it had arrived, `not_seen` settles it as a
   * failure that did nothing, and `running` (after one more wait), `unknown` or
   * no client to ask leave it `timed_out` (`./command-reconcile/`). The command
   * stays pending meanwhile, so its own answer, arriving late, still wins.
   */
  private async answerNeverCame(commandId: string, waitMs: number): Promise<void> {
    const pending = this.pending.get(commandId);
    if (!pending) return;
    const answer = await this.reconcileAction(commandId);
    if (this.pending.get(commandId) !== pending) return;
    this.pending.delete(commandId);
    const result = clientGatewayReconciledResult(commandId, answer, waitMs);
    this.history.closed(commandId, result.status === "timed_out" ? "timed_out" : "settled");
    if (answer) this.audit.record("command.reconciled", "A command whose answer never came was settled from what its client said became of it.", { sessionId: pending.sessionId, commandId, state: answer.state, status: result.status });
    pending.resolve(result);
  }

  private executeDurable(sessionId: string, command: ClientGatewayActionCommand, options: ClientGatewayDurableActionOptions): ClientGatewayDurableActionResponse {
    const response = this.durable.execute(sessionId, command, options);
    const owner = ClientGatewayCommandContext.owner(options.context);
    this.history.opened({ commandId: response.commandId, sessionId, clientId: this.sessions.require(sessionId).clientId, actionType: command.actionType, durable: true, owner: { projectId: owner.projectId, runId: owner.runId } });
    void response.result.then(
      (outcome) => this.history.closed(response.commandId, outcome.status === "outcome_unknown" ? "uncertain" : "settled"),
      () => {
        // best-effort: the dispatching caller is handed this rejection itself; here it only closes the command's record.
        this.history.closed(response.commandId, "uncertain");
      }
    );
    return response;
  }

  private async settleLate(senderSessionId: string, reading: ClientGatewayActionResultReading): Promise<ClientGatewayResultDisposition> {
    const sender = this.sessions.require(senderSessionId);
    const intake = this.history.intake({ sessionId: senderSessionId, clientId: sender.clientId }, reading);
    if (intake.kind !== "late") return "unknown_command";
    this.audit.record("command.late_result", "An action result arrived after Core stopped waiting for its command; it was kept as evidence and not applied.", lateAuditFields(intake.late));
    const failures = await this.history.publish(intake.late);
    if (failures.length) this.audit.record("command.late_result_unrecorded", "A late action result could not be put on its run's evidence.", { commandId: intake.late.commandId, failures: failures.length });
    return "late";
  }

  private readOwner(): ReturnType<NonNullable<ClientGatewayServiceOptions["commandOwner"]>> {
    return this.commandOwner?.();
  }

  async sendPing(sessionId: string): Promise<void> {
    const session = this.sessions.require(sessionId);
    await this.transport.send(sessionId, this.transport.message("server.ping", { nonce: randomUUID() }, session));
  }

  async sendError(sessionId: string, input: { message: string; code?: string; metadata?: JsonObject }): Promise<void> {
    const session = this.sessions.require(sessionId);
    await this.transport.send(sessionId, this.transport.message("server.error", {
      message: input.message,
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    }, session));
    this.audit.record(input.code ?? "client.error", input.message, { sessionId, ...(input.metadata ?? {}) });
  }

  markActiveRecording(sessionId: string, input: { recordingId: string; projectId?: string | null }): void {
    const session = this.sessions.requireReady(sessionId);
    session.activeRecordingId = input.recordingId;
    if (input.projectId !== undefined) session.projectId = input.projectId;
  }
}

function lateAuditFields(late: ClientGatewayLateActionResult): JsonObject {
  return {
    commandId: late.commandId,
    closedAs: late.closedAs,
    status: late.status,
    reportedStatus: late.reportedStatus,
    interrupted: late.interrupted,
    ...(late.owner ? { projectId: late.owner.projectId, runId: late.owner.runId } : {})
  };
}
