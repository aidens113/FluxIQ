import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../index.ts";
import { clientGatewayProtocolVersionVerdict } from "../protocol-version.ts";

function hello(protocolVersion: string | undefined): ClientGatewayClientMessage {
  return {
    id: "hello.synthetic",
    type: "client.hello",
    ...(protocolVersion !== undefined ? { protocolVersion } : {}),
    timestamp: Date.now(),
    payload: { clientId: "synthetic.client", clientType: "extension", name: "Synthetic Client", capabilities: [] }
  } as ClientGatewayClientMessage;
}

function connected() {
  const gateway = new ClientGatewayService();
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const session = gateway.connect({ socket: { send: (raw: string) => { sent.push(JSON.parse(raw)); } } });
  return { gateway, session, sent };
}

describe("the client hello's protocol version", () => {
  it("compares by major version", () => {
    expect(clientGatewayProtocolVersionVerdict("0.1", "0.1")).toEqual({ kind: "accepted", version: "0.1" });
    expect(clientGatewayProtocolVersionVerdict("0.7", "0.1")).toEqual({ kind: "accepted", version: "0.7" });
    expect(clientGatewayProtocolVersionVerdict(undefined, "0.1")).toEqual({ kind: "missing" });
    expect(clientGatewayProtocolVersionVerdict("  ", "0.1")).toEqual({ kind: "missing" });
    expect(clientGatewayProtocolVersionVerdict("1.0", "0.1")).toMatchObject({ kind: "refused", version: "1.0", reason: expect.stringContaining("Update FluxIQ") });
    expect(clientGatewayProtocolVersionVerdict("0.1", "1.0")).toMatchObject({ kind: "refused", reason: expect.stringContaining("Update the client") });
    expect(clientGatewayProtocolVersionVerdict("garbage", "0.1")).toMatchObject({ kind: "refused" });
  });

  it("accepts a hello under this gateway's version and goes on to pairing", async () => {
    const { gateway, session, sent } = connected();
    await gateway.receive(session.sessionId, hello(CLIENT_GATEWAY_PROTOCOL_VERSION));
    expect(gateway.snapshot().sessions[0]?.status).toBe("pairing_required");
    expect(sent.map((message) => message.type)).toEqual(["server.pairing_required"]);
  });

  it("refuses a hello under another major version with a plain reason and closes the session", async () => {
    const { gateway, session, sent } = connected();
    const major = Number.parseInt(CLIENT_GATEWAY_PROTOCOL_VERSION.split(".")[0] ?? "0", 10);
    await gateway.receive(session.sessionId, hello(`${major + 1}.0`));
    expect(sent.map((message) => message.type)).toEqual(["server.error", "server.disconnect"]);
    expect(sent[0]?.payload).toMatchObject({ code: "protocol_version_mismatch", message: expect.stringContaining(`${major + 1}.0`) });
    expect(gateway.snapshot().sessions[0]?.status).toBe("disconnected");
    expect(gateway.snapshot().pairings).toHaveLength(0);
    expect(gateway.snapshot().auditLog.map((entry) => entry.type)).toContain("session.protocol_version_refused");
  });

  it("accepts a hello with no version and records a warning", async () => {
    const { gateway, session } = connected();
    await gateway.receive(session.sessionId, hello(undefined));
    expect(gateway.snapshot().sessions[0]?.status).toBe("pairing_required");
    expect(gateway.snapshot().auditLog.map((entry) => entry.type)).toContain("session.protocol_version_missing");
  });
});
