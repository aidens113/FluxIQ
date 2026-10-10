import type { ClientGatewayActionResultStatus, ClientGatewayReportedActionStatus } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayActionResultReading } from "./action-result-reading.ts";

// The commands this gateway sent recently, so that a result arriving after Core
// stopped waiting for it is known for what it is: late.
//
// Core stops waiting for a command when its answer times out, when the session
// it went to disconnects (the durable path marks it uncertain), when the gateway
// closes, or when its result settles it. A client that lost its connection, or
// its background worker, answers afterwards: it re-sends a queued result, or
// reports a command it found still in flight as interrupted (browser contract
// B3). That answer is evidence about the run, never a fresh outcome: the caller
// already has the outcome it was given, and the run went on from it. So a late
// result resolves nothing and nobody's wait; it is handed to the listeners here,
// which put it on the run's evidence.
//
// Only an answer from the client the command was sent to counts, on whatever
// session it reconnected on. The record is bounded: the oldest commands are
// forgotten first, and a result for a forgotten command is simply unknown.

/** The run a command was sent for, when the dispatcher knew it. */
export type ClientGatewayCommandOwnerRef = { projectId: string; runId: string };

/** How Core had stopped waiting for a command when its late result came. */
export type ClientGatewayCommandClosure = "settled" | "timed_out" | "uncertain" | "closed";

/**
 * A result that arrived for a command Core no longer awaited. It names the
 * command and how it ended, never what the client said in words: no message,
 * payload or target, so no page data reaches the run's evidence through it.
 */
export type ClientGatewayLateActionResult = {
  commandId: string;
  actionType: string;
  owner?: ClientGatewayCommandOwnerRef;
  /** Whether the command went through the durable ledger (`gateway_command.v1`). */
  durable: boolean;
  closedAs: ClientGatewayCommandClosure;
  dispatchedAt: number;
  closedAt?: number;
  receivedAt: number;
  /** The status as Core reads it (`interrupted` read into `unknown` or `failed`). */
  status: ClientGatewayActionResultStatus;
  reportedStatus: ClientGatewayReportedActionStatus;
  interrupted: boolean;
  effect?: "unacted" | "ambiguous";
  /** The failure record's closed code, when the client sent a record that parses. */
  failureCode?: string;
  /** Whether the result came on the session the command was sent on, rather than a reconnected one. */
  sameSession: boolean;
};

export type ClientGatewayLateActionResultListener = (late: ClientGatewayLateActionResult) => void | Promise<void>;

type Sent = {
  commandId: string;
  sessionId: string;
  clientId: string;
  actionType: string;
  durable: boolean;
  owner?: ClientGatewayCommandOwnerRef;
  dispatchedAt: number;
  closedAs?: ClientGatewayCommandClosure;
  closedAt?: number;
};

/** What became of a result for a command no caller awaits. */
export type ClientGatewayLateIntake =
  | { kind: "late"; late: ClientGatewayLateActionResult }
  | { kind: "foreign_client" }
  | { kind: "unknown_command" };

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/u;

export class ClientGatewayCommandHistory {
  static readonly LIMIT = 512;
  private readonly sent = new Map<string, Sent>();
  private readonly listeners = new Set<ClientGatewayLateActionResultListener>();

  constructor(private readonly now: () => number) {}

  /** Remembers a command as it is dispatched. An owner that is not a pair of plain ids is dropped. */
  opened(input: { commandId: string; sessionId: string; clientId: string; actionType: string; durable: boolean; owner?: ClientGatewayCommandOwnerRef | undefined }): void {
    const owner = readableOwner(input.owner);
    this.sent.delete(input.commandId);
    this.sent.set(input.commandId, {
      commandId: input.commandId,
      sessionId: input.sessionId,
      clientId: input.clientId,
      actionType: input.actionType.slice(0, 200),
      durable: input.durable,
      ...(owner ? { owner } : {}),
      dispatchedAt: this.now()
    });
    while (this.sent.size > ClientGatewayCommandHistory.LIMIT) this.sent.delete(this.sent.keys().next().value!);
  }

  /** Where a remembered command was sent, so its client can be asked what became of it. */
  route(commandId: string): { sessionId: string; clientId: string } | undefined {
    const sent = this.sent.get(commandId);
    return sent ? { sessionId: sent.sessionId, clientId: sent.clientId } : undefined;
  }

  /** Records how Core stopped waiting for a command. The first closure stands. */
  closed(commandId: string, closedAs: ClientGatewayCommandClosure): void {
    const sent = this.sent.get(commandId);
    if (!sent || sent.closedAs) return;
    sent.closedAs = closedAs;
    sent.closedAt = this.now();
  }

  /**
   * Reads a result for a command no caller awaits. A command still open here
   * but awaited by nobody is between its closure and the record of it, and
   * counts as uncertain.
   */
  intake(sender: { sessionId: string; clientId: string }, reading: ClientGatewayActionResultReading): ClientGatewayLateIntake {
    const sent = this.sent.get(reading.result.commandId);
    if (!sent) return { kind: "unknown_command" };
    if (sent.clientId !== sender.clientId) return { kind: "foreign_client" };
    const failureCode = reading.result.failure && typeof reading.result.failure.code === "string" && ID_PATTERN.test(reading.result.failure.code) ? reading.result.failure.code : undefined;
    const late: ClientGatewayLateActionResult = {
      commandId: sent.commandId,
      actionType: sent.actionType,
      ...(sent.owner ? { owner: { ...sent.owner } } : {}),
      durable: sent.durable,
      closedAs: sent.closedAs ?? "uncertain",
      dispatchedAt: sent.dispatchedAt,
      ...(sent.closedAt !== undefined ? { closedAt: sent.closedAt } : {}),
      receivedAt: this.now(),
      status: reading.result.status,
      reportedStatus: reading.reportedStatus,
      interrupted: reading.interrupted,
      ...(reading.effect ? { effect: reading.effect } : {}),
      ...(failureCode ? { failureCode } : {}),
      sameSession: sent.sessionId === sender.sessionId
    };
    return { kind: "late", late };
  }

  onLate(listener: ClientGatewayLateActionResultListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hands a late result to every listener. A listener's failure is returned, never thrown past the others. */
  async publish(late: ClientGatewayLateActionResult): Promise<unknown[]> {
    const results = await Promise.allSettled([...this.listeners].map(async (listener) => await listener(structuredClone(late))));
    return results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
  }
}

function readableOwner(owner: ClientGatewayCommandOwnerRef | undefined): ClientGatewayCommandOwnerRef | undefined {
  if (!owner || typeof owner !== "object") return undefined;
  const { projectId, runId } = owner;
  return typeof projectId === "string" && ID_PATTERN.test(projectId) && typeof runId === "string" && ID_PATTERN.test(runId) ? { projectId, runId } : undefined;
}
