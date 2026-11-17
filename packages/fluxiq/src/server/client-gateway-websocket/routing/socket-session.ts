import type { ClientGatewayPeer, ClientGatewayService } from "../../../client-gateway/index.ts";
import type { JsonObject } from "../../../core/index.ts";
import { isClientHelloText } from "../is-client-hello.ts";
import type { NativeWebSocketConnection, NativeWebSocketViolation } from "../native-connection.ts";
import { serverEnvelope } from "../server-envelope.ts";
import type { ClientGatewayTransportLimits } from "../transport-limits.ts";
import type { ClientGatewayTransportIdentityLeases } from "./identity-leases.ts";
import { readRoutedClientHello } from "./read-hello.ts";
import type { ClientGatewayResolver, ClientGatewayRouteLease } from "./types.ts";

type SessionInput = {
  gateway: ClientGatewayService;
  resolveGateway: ClientGatewayResolver | undefined;
  identities: ClientGatewayTransportIdentityLeases;
  limits: ClientGatewayTransportLimits;
  peer: ClientGatewayPeer;
  origin: string | null;
  onRelease(pending: Promise<void>): void;
};

/** Socket-owned admission, bounded serial input and authority lifetime. */
export class ClientGatewaySocketSession {
  private connection!: NativeWebSocketConnection;
  private gateway: ClientGatewayService | null = null;
  private sessionId = "";
  private route: ClientGatewayRouteLease | null = null;
  private identity: { release(): void } | null = null;
  private readonly controller = new AbortController();
  private readonly queue: Array<{ text: string; bytes: number }> = [];
  private pendingBytes = 0;
  private delivering = false;
  private ended = false;
  private reason = "socket closed";
  private deadline: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly input: SessionInput) {}

  start(connection: NativeWebSocketConnection): void {
    this.connection = connection;
    if (!this.input.resolveGateway) {
      this.gateway = this.input.gateway;
      this.sessionId = this.gateway.connect({ socket: connection, peer: this.input.peer }).sessionId;
    }
    if (this.input.limits.helloDeadlineMs !== null) {
      this.deadline = setTimeout(() => {
        this.reason = "hello deadline";
        this.audit("transport.hello_deadline", "A client did not complete its first hello route before the transport deadline.", { helloDeadlineMs: this.input.limits.helloDeadlineMs });
        connection.terminate(1008, this.reason);
      }, this.input.limits.helloDeadlineMs);
      this.deadline.unref();
    }
  }

  enqueue(text: string): void {
    if (this.ended) return;
    if (!this.input.resolveGateway && isClientHelloText(text)) this.clearDeadline();
    const bytes = Buffer.byteLength(text, "utf8");
    const pendingBytes = this.pendingBytes + bytes;
    if (pendingBytes > this.input.limits.maxFrameBytes) {
      this.violation({ kind: "frame_too_large", declaredBytes: pendingBytes });
      this.connection.terminate(1009, "pending input too large");
      return;
    }
    this.pendingBytes = pendingBytes;
    this.queue.push({ text, bytes });
    if (!this.delivering) void this.deliver();
  }

  violation(violation: NativeWebSocketViolation): void {
    if (violation.kind === "frame_too_large") {
      this.reason = "frame too large";
      this.audit("transport.frame_too_large", "A client exceeded the transport frame or pending-input size limit.", { declaredBytes: violation.declaredBytes, maxFrameBytes: this.input.limits.maxFrameBytes });
    } else {
      this.reason = "rate limit exceeded";
      this.audit("transport.rate_limited", "A client exceeded the transport message rate limit.", { messagesPerSecond: this.input.limits.messagesPerSecond, messageBurst: this.input.limits.messageBurst });
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.controller.abort();
    this.clearDeadline();
    this.queue.length = 0;
    this.pendingBytes = 0;
    try {
      if (this.gateway && this.sessionId) this.gateway.disconnect(this.sessionId, this.reason);
    } catch {
      this.audit("transport.disconnect_failed", "A gateway session could not be disconnected.", {});
    } finally {
      const route = this.route;
      const identity = this.identity;
      this.route = null;
      this.identity = null;
      this.release(route, identity, this.inFlight);
    }
  }

  private async deliver(): Promise<void> {
    this.delivering = true;
    try {
      while (!this.ended && this.queue.length) {
        const message = this.queue.shift()!;
        try {
          if (!this.gateway && !await this.resolve(message.text)) return;
          if (this.ended || !this.gateway) return;
          const pending = this.gateway.receiveRaw(this.sessionId, message.text);
          this.inFlight = pending;
          try {
            await pending;
          } finally {
            this.inFlight = null;
          }
        } catch {
          this.audit("transport.receive_failed", "A gateway message could not be delivered.", {});
          if (this.connection.open) this.connection.send(serverEnvelope("server.error", { message: "Invalid client gateway message.", code: "gateway.receive_failed" }));
        } finally {
          if (!this.ended) this.pendingBytes -= message.bytes;
        }
      }
    } finally {
      this.delivering = false;
    }
  }

  private async resolve(text: string): Promise<boolean> {
    const hello = readRoutedClientHello(text);
    if (!hello) {
      this.refuse("gateway.invalid_hello", "A valid client.hello is required before gateway routing.");
      return false;
    }
    try {
      const route = await this.input.resolveGateway!({ hello, peer: this.input.peer, origin: this.input.origin, signal: this.controller.signal });
      if (this.ended || !this.connection.open) {
        if (route) this.release(route, null, null);
        return false;
      }
      if (!route) {
        this.refuse("gateway.route_refused", "Client gateway routing was refused.");
        return false;
      }
      this.route = route;
      if (route.gateway.snapshot().enabled === false) {
        this.refuse("gateway.route_refused", "Client gateway routing was refused.");
        return false;
      }
      this.identity = this.input.identities.acquire(route.gateway);
      this.gateway = route.gateway;
      this.sessionId = route.gateway.connect({ socket: this.connection, peer: this.input.peer }).sessionId;
      this.clearDeadline();
      return true;
    } catch {
      if (!this.ended) this.refuse("gateway.route_refused", "Client gateway routing was refused.");
      return false;
    }
  }

  private refuse(code: string, message: string): void {
    this.reason = code;
    this.audit("transport.route_refused", "A first-hello gateway route was refused.", { code });
    this.connection.send(serverEnvelope("server.error", { code, message }));
    this.connection.terminate(1008, code);
  }

  private release(route: ClientGatewayRouteLease | null, identity: { release(): void } | null, inFlight: Promise<void> | null): void {
    if (!route && !identity && !inFlight) return;
    const pending = (async () => {
      if (inFlight) await Promise.allSettled([inFlight]);
      try {
        identity?.release();
      } finally {
        await route?.release();
      }
    })().catch(() => {
      this.audit("transport.route_release_failed", "A client gateway route lease could not be released.", {});
      throw new Error("Client gateway route cleanup failed.");
    });
    this.input.onRelease(pending);
  }

  private clearDeadline(): void {
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.deadline = null;
  }

  private audit(type: string, message: string, metadata: JsonObject): void {
    const fields: JsonObject = { ...metadata, clientAddressPrefix: this.input.peer.prefix };
    if (this.sessionId) fields.sessionId = this.sessionId;
    (this.gateway ?? this.input.gateway).recordTransportEvent(type, message, fields);
  }
}
