import type { ClientGatewayReconcileAnswer } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { InternalSession } from "../types.ts";
import { readClientGatewayReconcileAnswer } from "./answer-reading.ts";
import { clientGatewaySessionAnswersReconcile } from "./session-answers.ts";

// Asking a client what became of one command it was sent (state-aware recovery
// plan, C8 and B3), by command id, before Core calls the command's outcome
// uncertain. The request never acts: the client answers from the record it
// keeps of every command and the results it kept (`landed`, `not_seen`,
// `running`, `unknown`).
//
// Only the client the command was sent to is asked, on the session it went to
// or, when that one is gone, on the session it reconnected on, and only when
// that session declared it answers (`./session-answers.ts`). A client that
// says nothing within the answer window is `unknown`. A command still
// `running` is waited on once, for the same window, and asked again; a second
// `running` stands, and the caller treats it as `unknown`.

/** Where a command was sent: its session, and the client behind it. */
export type ClientGatewayReconcileRoute = { sessionId: string; clientId: string };

type Waiter = {
  clientId: string;
  resolve(answer: ClientGatewayReconcileAnswer): void;
  timer: ReturnType<typeof setTimeout>;
};

type ReconcilerDeps = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  /** How long one answer is waited for, and how long a `running` command is given before it is asked again. */
  answerMs: number;
};

export class ClientGatewayCommandReconciler {
  private readonly waiting = new Map<string, Waiter>();
  private readonly asking = new Map<string, Promise<ClientGatewayReconcileAnswer | undefined>>();
  private closed = false;

  constructor(private readonly deps: ReconcilerDeps) {}

  /**
   * What became of `commandId`: one answer, or, for `running`, a second after
   * one bounded wait. `undefined` when no session of its client could be asked
   * at all, so the caller keeps the outcome it had.
   */
  async reconcile(route: ClientGatewayReconcileRoute, commandId: string): Promise<ClientGatewayReconcileAnswer | undefined> {
    const first = await this.ask(route, commandId);
    if (first?.state !== "running") return first;
    await this.pause();
    const second = await this.ask(route, commandId);
    return second ?? { commandId, state: "unknown" };
  }

  /** Asks once. A second caller asking for the same command meanwhile shares the one request. */
  ask(route: ClientGatewayReconcileRoute, commandId: string): Promise<ClientGatewayReconcileAnswer | undefined> {
    const current = this.asking.get(commandId);
    if (current) return current;
    const asked = this.send(route, commandId).finally(() => this.asking.delete(commandId));
    this.asking.set(commandId, asked);
    return asked;
  }

  /**
   * A client's `client.reconcile_result`. Taken only from the client that was
   * asked, for a command it is being asked about, and in the closed words;
   * anything else is not an answer and is left to the wait.
   */
  answer(senderClientId: string, payload: unknown): boolean {
    const commandId = typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as { commandId?: unknown }).commandId : undefined;
    if (typeof commandId !== "string") return false;
    const waiter = this.waiting.get(commandId);
    if (!waiter || waiter.clientId !== senderClientId) return false;
    const answer = readClientGatewayReconcileAnswer(commandId, payload);
    if (!answer) return false;
    this.finish(commandId, answer);
    return true;
  }

  /** Every open question ends `unknown`, and nothing more is asked. */
  abandonAll(): void {
    this.closed = true;
    for (const commandId of [...this.waiting.keys()]) this.finish(commandId, { commandId, state: "unknown" });
  }

  private async send(route: ClientGatewayReconcileRoute, commandId: string): Promise<ClientGatewayReconcileAnswer | undefined> {
    if (this.closed) return undefined;
    const session = this.sessionFor(route);
    if (!session) return undefined;
    const answer = new Promise<ClientGatewayReconcileAnswer>((resolve) => {
      const timer = setTimeout(() => this.finish(commandId, { commandId, state: "unknown" }), this.deps.answerMs);
      this.waiting.set(commandId, { clientId: session.clientId, resolve, timer });
    });
    this.deps.audit.record("command.reconcile_asked", "Asked the client what became of a command whose answer never came.", { sessionId: session.sessionId, commandId });
    try {
      await this.deps.transport.send(session.sessionId, this.deps.transport.message("server.reconcile_command", { commandId }, session));
    } catch {
      // A request that could not be sent cannot be answered; the question ends unknown now rather than at the window.
      this.finish(commandId, { commandId, state: "unknown" });
    }
    return await answer;
  }

  private finish(commandId: string, answer: ClientGatewayReconcileAnswer): void {
    const waiter = this.waiting.get(commandId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.waiting.delete(commandId);
    waiter.resolve(answer);
  }

  /** The command's own session when it is still ready, else a ready session of the same client; either must answer. */
  private sessionFor(route: ClientGatewayReconcileRoute): InternalSession | undefined {
    const own = this.deps.sessions.get(route.sessionId);
    const candidates = own ? [own, ...this.deps.sessions.list()] : this.deps.sessions.list();
    return candidates.find((session) => session.status === "ready" && session.clientId === route.clientId && clientGatewaySessionAnswersReconcile(session));
  }

  private async pause(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.deps.answerMs);
      timer.unref?.();
    });
  }
}
