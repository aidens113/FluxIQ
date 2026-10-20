import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage, type ClientGatewayServerMessage } from "@fluxiq/contracts/client-gateway";
import type { FluxIQWebSocketLike } from "../../index.ts";

// A WebSocket the tests drive by hand. With `FakeSocket.opens` set it opens on
// the next microtask (fake timers do not hold microtasks); otherwise it stays
// CONNECTING until `open()`, the shape of a gateway that never answers the
// upgrade. Closing it does not fire `close`: `drop()` does, as the network or
// the gateway would.

let serverMessageCounter = 0;

export class FakeSocket implements FluxIQWebSocketLike {
  static created: FakeSocket[] = [];
  static opens = true;
  readyState = 0;
  closed = false;
  failSends = false;
  /** The (faked) clock when the client created this socket. */
  readonly createdAt = Date.now();
  readonly sent: ClientGatewayClientMessage[] = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.created.push(this);
    if (FakeSocket.opens) queueMicrotask(() => this.open());
  }

  static reset(opens = true): void {
    FakeSocket.created = [];
    FakeSocket.opens = opens;
  }

  static latest(): FakeSocket {
    const socket = FakeSocket.created.at(-1);
    if (!socket) throw new Error("No socket was created.");
    return socket;
  }

  send(data: string): void {
    if (this.failSends) throw new Error("The fake socket refused the send.");
    this.sent.push(JSON.parse(data) as ClientGatewayClientMessage);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  open(): void {
    if (this.closed) return;
    this.readyState = 1;
    this.dispatch("open", {});
  }

  /** The network dropping, or the gateway closing: the socket closes under the client. */
  drop(): void {
    this.readyState = 3;
    this.dispatch("close", { code: 1006, reason: "" });
  }

  serverSays<TType extends ClientGatewayServerMessage["type"]>(
    type: TType,
    payload: Extract<ClientGatewayServerMessage, { type: TType }>["payload"]
  ): void {
    serverMessageCounter += 1;
    const message = { id: `server-message.${serverMessageCounter}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: serverMessageCounter, payload };
    this.dispatch("message", { data: JSON.stringify(message) });
  }

  sentTypes(): string[] {
    return this.sent.map((message) => message.type);
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}
