import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID,
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayActivity,
  type ClientGatewayCapability,
  type ClientGatewayClientMessage,
  type ClientGatewaySocket
} from "../../index.ts";

const ACTIVITY_CAPABILITY: ClientGatewayCapability = { id: CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, kind: "state" };

describe("ClientGatewayService.publishActivity", () => {
  it("sends only to ready sessions that advertised the activity capability", async () => {
    const gateway = new ClientGatewayService();
    const capable = await pairedSession(gateway, "extension.capable", [ACTIVITY_CAPABILITY]);
    const plain = await pairedSession(gateway, "extension.plain", [{ id: "sample.record", kind: "recording" }]);
    const unpaired = await unpairedSession(gateway, "extension.unpaired", [ACTIVITY_CAPABILITY]);

    expect(gateway.publishActivity(activity(1), { projectId: "project.1" })).toBe(1);

    expect(activityMessages(capable.socket)).toEqual([expect.objectContaining({
      type: "server.activity",
      sessionId: capable.sessionId,
      payload: activity(1)
    })]);
    expect(activityMessages(plain.socket)).toEqual([]);
    expect(activityMessages(unpaired.socket)).toEqual([]);
  });

  it("sends to sessions bound to the target project or to no project, and skips other projects", async () => {
    const gateway = new ClientGatewayService();
    const same = await pairedSession(gateway, "extension.same", [ACTIVITY_CAPABILITY]);
    const unbound = await pairedSession(gateway, "extension.unbound", [ACTIVITY_CAPABILITY]);
    const other = await pairedSession(gateway, "extension.other", [ACTIVITY_CAPABILITY]);
    gateway.markActiveRecording(same.sessionId, { recordingId: "recording.1", projectId: "project.1" });
    gateway.markActiveRecording(unbound.sessionId, { recordingId: "recording.2", projectId: null });
    gateway.markActiveRecording(other.sessionId, { recordingId: "recording.3", projectId: "project.2" });

    expect(gateway.publishActivity(activity(2), { projectId: "project.1" })).toBe(2);

    expect(activityMessages(same.socket)).toHaveLength(1);
    expect(activityMessages(unbound.socket)).toHaveLength(1);
    expect(activityMessages(other.socket)).toEqual([]);
  });

  it("writes to the socket without entering the session's outbound queue", async () => {
    const gateway = new ClientGatewayService();
    const capable = await pairedSession(gateway, "extension.queue", [ACTIVITY_CAPABILITY]);
    const queuedBefore = gateway.outbound(capable.sessionId).length;

    for (let sequence = 1; sequence <= 50; sequence += 1) gateway.publishActivity(activity(sequence), { projectId: "project.1" });

    expect(activityMessages(capable.socket)).toHaveLength(50);
    expect(gateway.outbound(capable.sessionId)).toHaveLength(queuedBefore);
    expect(gateway.outbound(capable.sessionId).some((message) => message.type === "server.activity")).toBe(false);
  });

  it("drops the event for a closed socket without throwing and still reaches the others", async () => {
    const gateway = new ClientGatewayService();
    const closed = await pairedSession(gateway, "extension.closed", [ACTIVITY_CAPABILITY]);
    const rejecting = await pairedSession(gateway, "extension.rejecting", [ACTIVITY_CAPABILITY]);
    const open = await pairedSession(gateway, "extension.open", [ACTIVITY_CAPABILITY]);
    closed.socket.closed = true;
    rejecting.socket.rejects = true;

    expect(() => gateway.publishActivity(activity(3), { projectId: "project.1" })).not.toThrow();
    await Promise.resolve();

    expect(activityMessages(closed.socket)).toEqual([]);
    expect(activityMessages(open.socket)).toHaveLength(1);
    expect(gateway.outbound(closed.sessionId).some((message) => message.type === "server.activity")).toBe(false);
  });

  it("counts nothing for a ready session with no socket", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.socketless",
      clientType: "extension",
      name: "Socketless",
      capabilities: [ACTIVITY_CAPABILITY]
    }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });

    expect(gateway.publishActivity(activity(4), { projectId: "project.1" })).toBe(0);
    expect(gateway.outbound(session.sessionId).some((message) => message.type === "server.activity")).toBe(false);
  });
});

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: string[] = [];
  closed = false;
  rejects = false;

  send(message: string): void | Promise<void> {
    if (this.closed) throw new Error("socket closed");
    if (this.rejects) return Promise.reject(new Error("socket closed mid-send"));
    this.sent.push(message);
  }
}

async function unpairedSession(gateway: ClientGatewayService, clientId: string, capabilities: ClientGatewayCapability[]) {
  const socket = new RecordingSocket();
  const session = gateway.connect({ socket });
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId, capabilities }));
  return { sessionId: session.sessionId, socket };
}

async function pairedSession(gateway: ClientGatewayService, clientId: string, capabilities: ClientGatewayCapability[]) {
  const unpaired = await unpairedSession(gateway, clientId, capabilities);
  const pairing = gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === unpaired.sessionId);
  const approved = await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.test" });
  expect(approved?.status).toBe("ready");
  return unpaired;
}

function activityMessages(socket: RecordingSocket): Array<{ type: string; sessionId?: string; payload: unknown }> {
  return socket.sent.map((raw) => JSON.parse(raw) as { type: string; sessionId?: string; payload: unknown }).filter((message) => message.type === "server.activity");
}

function activity(sequence: number): ClientGatewayActivity {
  return {
    activityId: "build.1",
    sequence,
    subject: { kind: "build", id: "build.1", projectId: "project.1" },
    phase: "running",
    label: `Running step ${sequence}`,
    at: "2026-09-29T00:00:00.000Z"
  };
}

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]
): Extract<ClientGatewayClientMessage, { type: TType }> {
  return {
    id: `message.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload
  } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
