import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  FluxIQAutomationStudioWebSocketClient,
  FluxIQClientGatewayWebSocketClient,
  type ClientGatewayServerMessage,
  type FluxIQWebSocketLike
} from "./index";

describe("FluxIQClientGatewayWebSocketClient", () => {
  it("connects, sends hello, and emits pairing requests", async () => {
    const sockets: FakeWebSocket[] = [];
    const client = new FluxIQClientGatewayWebSocketClient({
      url: "ws://local/client",
      client: { clientId: "extension.test", clientType: "extension", name: "Test extension" },
      WebSocketImpl: class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      }
    });
    const pairing: string[] = [];
    client.on("pairing_required", (event) => {
      pairing.push(event.message.payload.referenceCode ?? "");
    });

    await client.connect();
    expect(JSON.parse(sockets[0]!.sent[0] ?? "{}")).toMatchObject({
      type: "client.hello",
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      payload: { clientId: "extension.test", clientType: "extension" }
    });

    sockets[0]!.receive(serverMessage("server.pairing_required", { reason: "Approve in FluxIQ.", referenceCode: "ABCD" }));
    expect(pairing).toEqual(["ABCD"]);
  });

  it("stores approved tokens and sends typed recording events", async () => {
    const sockets: FakeWebSocket[] = [];
    let storedToken = "";
    const client = new FluxIQClientGatewayWebSocketClient({
      client: { clientId: "domain.client", clientType: "custom", name: "Domain client" },
      WebSocketImpl: class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      },
      tokenStorage: {
        read: () => storedToken || undefined,
        write: (token) => {
          storedToken = token;
        }
      },
      idFactory: () => "message.test",
      now: () => 123
    });
    await client.connect();

    sockets[0]!.receive(serverMessage("server.session_ready", { sessionId: "session.1", token: "token.1" }, { sessionId: "session.1" }));
    expect(storedToken).toBe("token.1");
    expect(client.currentSessionId).toBe("session.1");

    await client.sendRecordingEvent({
      domainId: "example.domain",
      eventType: "counter.changed",
      payload: { value: 7 }
    });
    expect(JSON.parse(sockets[0]!.sent[1] ?? "{}")).toMatchObject({
      id: "message.test",
      type: "client.recording_event",
      sessionId: "session.1",
      payload: { domainId: "example.domain", eventType: "counter.changed", payload: { value: 7 } }
    });
  });

  it("mirrors Automation Studio recording methods over websocket messages", async () => {
    const sockets: FakeWebSocket[] = [];
    const client = new FluxIQAutomationStudioWebSocketClient({
      client: { clientId: "domain.client", clientType: "custom", name: "Domain client" },
      WebSocketImpl: class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      },
      idFactory: idFactory(),
      now: () => 500
    });
    await client.connect();
    sockets[0]!.receive(serverMessage("server.session_ready", { sessionId: "session.1", token: "token.1" }, { sessionId: "session.1" }));

    await client.createRecording({
      projectId: "project.1",
      recordingId: "recording.1",
      startedAt: 1,
      initialState: { timestamp: 1, namespaces: {} },
      environment: { id: "env.1", label: "Domain env", kind: "custom", domainId: "example.domain" },
      metadata: { purpose: "test" }
    });
    await client.appendRecordingDomainEvent({
      projectId: "project.1",
      recordingId: "recording.1",
      domainId: "example.domain",
      eventType: "counter.changed",
      payload: { value: 7 }
    });
    await client.appendRecordingEvent({
      projectId: "project.1",
      recordingId: "recording.1",
      entry: { type: "marker", label: "Checkpoint" }
    });
    await client.finalizeRecording({ projectId: "project.1", recordingId: "recording.1", endedAt: 700 });

    expect(sockets[0]!.sent.slice(1).map((message) => JSON.parse(message).type)).toEqual([
      "client.start_recording",
      "client.recording_event",
      "client.recording_entry",
      "client.stop_recording"
    ]);
    expect(JSON.parse(sockets[0]!.sent[1] ?? "{}")).toMatchObject({
      type: "client.start_recording",
      payload: {
        projectId: "project.1",
        recordingId: "recording.1",
        startedAt: 1,
        domainId: "example.domain",
        initialState: { timestamp: 1, namespaces: {} }
      }
    });
    expect(JSON.parse(sockets[0]!.sent[2] ?? "{}")).toMatchObject({
      type: "client.recording_event",
      payload: {
        recordingId: "recording.1",
        domainId: "example.domain",
        eventType: "counter.changed",
        payload: { value: 7 },
        metadata: { projectId: "project.1" }
      }
    });
    expect(JSON.parse(sockets[0]!.sent[4] ?? "{}")).toMatchObject({
      type: "client.stop_recording",
      payload: { projectId: "project.1", recordingId: "recording.1", endedAt: 700 }
    });
  });
});

class FakeWebSocket implements FluxIQWebSocketLike {
  readyState = 0;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatch("open", {});
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.dispatch("close", { code, reason });
  }

  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: "open" | "message" | "close" | "error", listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  receive(message: ClientGatewayServerMessage): void {
    this.dispatch("message", { data: JSON.stringify(message) });
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function serverMessage<TType extends ClientGatewayServerMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayServerMessage, { type: TType }>["payload"],
  options: { sessionId?: string } = {}
): Extract<ClientGatewayServerMessage, { type: TType }> {
  return {
    id: `server.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    payload
  } as Extract<ClientGatewayServerMessage, { type: TType }>;
}

function idFactory(): () => string {
  let index = 0;
  return () => `message.${++index}`;
}
