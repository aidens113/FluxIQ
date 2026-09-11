import { randomUUID } from "node:crypto";
import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResponse,
  ClientGatewayActionResult
} from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../core/index.ts";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { PendingCommand } from "./types.ts";

type CommandCollaborators = {
  config: ClientGatewayConfig;
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
};

/**
 * Everything the server asks a paired client to do, plus the pending-command
 * table that matches an action result back to the caller waiting on it.
 */
export class ClientGatewayCommands {
  private readonly pending = new Map<string, PendingCommand>();
  private readonly config: ClientGatewayConfig;
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;

  constructor(collaborators: CommandCollaborators) {
    this.config = collaborators.config;
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
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

  executeAction(sessionId: string, command: ClientGatewayActionCommand): ClientGatewayActionResponse {
    const session = this.sessions.requireReady(sessionId);
    const commandId = randomUUID();
    const message = this.transport.message("server.execute_action", { ...command, commandId }, session);
    const timeoutMs = command.timeoutMs ?? this.config.commandTimeoutMs;
    const result = new Promise<ClientGatewayActionResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(commandId);
        resolve({ commandId, status: "timed_out", message: `Client action timed out after ${timeoutMs}ms.` });
      }, timeoutMs);
      this.pending.set(commandId, { sessionId, resolve, timeout });
    });
    void this.transport.send(sessionId, message);
    this.audit.record("command.dispatched", "Action command dispatched to client.", { sessionId, commandId, actionType: command.actionType });
    return { commandId, message, result };
  }

  /** Settle the caller waiting on this command, if one still is. */
  settle(result: ClientGatewayActionResult): void {
    const pending = this.pending.get(result.commandId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(result.commandId);
    pending.resolve(result);
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
