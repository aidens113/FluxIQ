// A scripted, non-browser gateway client for unit tests (traces and offline
// trials, P1; lane T U2b, section 5). It is a plain ClientGatewaySocket: each
// `server.execute_action` it is sent is answered through the gateway's own
// intake (`receive` with `client.action_result`), looked up by the external
// call -- action type, canonical parameters and occurrence -- never by node id.
// Nothing in it names a page, a selector, an address or a tab, which is what
// shows the channel carries no web-specific field.
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionResult, type ClientGatewayClientHello, type ClientGatewayServerMessage, type ClientGatewayService, type ClientGatewaySession } from "../../../../../client-gateway/index.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** One scripted answer: the call it answers and what the client reports for it. */
export type FixtureAnswer = {
  actionType: string;
  parameters: JsonObject;
  /** 1 for the first call with this action type and parameters, 2 for the second, and so on. */
  occurrence: number;
  result: Omit<ClientGatewayActionResult, "commandId">;
};

export class FixtureGatewayClient {
  readonly received: ClientGatewayServerMessage[] = [];
  private readonly counts = new Map<string, number>();
  private readonly gateway: ClientGatewayService;
  private readonly answers: readonly FixtureAnswer[];
  private sessionId: string | undefined;

  constructor(gateway: ClientGatewayService, answers: readonly FixtureAnswer[]) {
    this.gateway = gateway;
    this.answers = answers;
  }

  /** Attaches this client to the gateway under `scopeId`; it answers only what reaches it there. */
  attach(scopeId: string, hello: ClientGatewayClientHello): ClientGatewaySession {
    const session = this.gateway.attachScopedSession({ scopeId, socket: { send: (raw) => this.onSend(raw) }, hello });
    this.sessionId = session.sessionId;
    return session;
  }

  private onSend(raw: string): void {
    const message = JSON.parse(raw) as ClientGatewayServerMessage;
    this.received.push(message);
    if (message.type !== "server.execute_action") return;
    const key = fixtureCallKey(message.payload.actionType, message.payload.parameters ?? {});
    const occurrence = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, occurrence);
    const answer = this.answers.find((candidate) => fixtureCallKey(candidate.actionType, candidate.parameters) === key && candidate.occurrence === occurrence);
    const commandId = message.payload.commandId;
    const result: ClientGatewayActionResult = answer
      ? { ...answer.result, commandId }
      : { commandId, status: "failed", error: "The fixture holds no answer for this call.", failure: { category: "blocked_by_capability_or_policy", code: "fixture.unmatched_call", retryable: false, stage: "dispatch", effect: "unacted" } };
    const sessionId = this.sessionId!;
    queueMicrotask(() => {
      void this.gateway.receive(sessionId, { id: `fixture.${commandId}`, type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: result });
    });
  }
}

/** The external call a command makes: its action type and its parameters with every object's keys in order. */
function fixtureCallKey(actionType: string, parameters: JsonObject): string {
  return `${actionType} ${JSON.stringify(canonical(parameters))}`;
}

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as JsonObject)[key]!)]));
  return value;
}
