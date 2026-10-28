// The host lease on client gateway action commands (automation-project-agents-plan,
// `Host resources and concurrency`): optional on the wire, and every refusal
// code a valid failure-record code for the refusal both sides report.
//
// Gateway 0.2 (hosted production plan) is additive: every 0.1 message is still
// a valid message, a 0.1 client meets only optional additions and two message
// types it may ignore, and the stamped version still speaks 0.1's major.
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES,
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  type ClientGatewayActionCommand,
  type ClientGatewayClientHello,
  type ClientGatewayHostLease,
  type ClientGatewayServerMessage
} from "../client-gateway.ts";
import { parseAutomationStudioFailureRecord } from "../failure/index.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSIONS, parseClientGatewayRunContext } from "../platform/index.ts";

describe("client gateway host lease contract", () => {
  it("keeps a command without a lease valid and carries one when stamped", () => {
    const lease: ClientGatewayHostLease = { resourceKey: "resource-1", epoch: 1, holder: { role: "builder", briefId: "brief.a" } };
    const plain: ClientGatewayActionCommand = { actionType: "synthetic.act" };
    const leased: ClientGatewayActionCommand = { ...plain, lease };
    expect(Object.hasOwn(plain, "lease")).toBe(false);
    expect(JSON.parse(JSON.stringify(leased))).toEqual({ actionType: "synthetic.act", lease });
  });

  it("names three frozen refusal codes", () => {
    expect(Object.isFrozen(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES)).toBe(true);
    expect(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES).toEqual({ stale: "host_lease.stale", holderMismatch: "host_lease.holder_mismatch", missing: "host_lease.missing" });
  });

  it.each(Object.values(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES))("%s parses as a blocked, unretryable, unacted dispatch failure", (code) => {
    const record = { category: "blocked_by_capability_or_policy", code, retryable: false, stage: "dispatch", effect: "unacted" };
    expect(parseAutomationStudioFailureRecord(record)).toEqual(record);
  });
});

describe("client gateway 0.2 compatibility with 0.1", () => {
  const envelope = { id: "m1", protocolVersion: "0.1", timestamp: 1 } as const;

  it("keeps every 0.1 server payload valid as written", () => {
    const messages: ClientGatewayServerMessage[] = [
      { ...envelope, type: "server.pairing_required", payload: { referenceCode: "ABCDEFGH", reason: "approve in the panel" } },
      { ...envelope, type: "server.session_ready", payload: { sessionId: "s1", token: "t1", projectId: null } },
      { ...envelope, type: "server.execute_action", payload: { commandId: "c1", actionType: "synthetic.act" } }
    ];
    expect(messages.map((message) => message.type)).toEqual(["server.pairing_required", "server.session_ready", "server.execute_action"]);
  });

  it("keeps a 0.1 hello valid and adds clientLabel to its metadata", () => {
    const legacy: ClientGatewayClientHello = { clientType: "extension", token: "t", metadata: { domainId: "web", anything: [1, "two"] } };
    const labelled: ClientGatewayClientHello = { ...legacy, metadata: { ...legacy.metadata, clientLabel: "Work laptop" } };
    expect(labelled.metadata?.clientLabel).toBe("Work laptop");
    expectTypeOf<NonNullable<ClientGatewayClientHello["metadata"]>["clientLabel"]>().toEqualTypeOf<string | undefined>();
  });

  it("adds only optional fields to existing payloads", () => {
    type SessionReady = Extract<ClientGatewayServerMessage, { type: "server.session_ready" }>["payload"];
    type PairingRequired = Extract<ClientGatewayServerMessage, { type: "server.pairing_required" }>["payload"];
    expectTypeOf<{ sessionId: string; token: string }>().toMatchTypeOf<SessionReady>();
    expectTypeOf<{ reason: string }>().toMatchTypeOf<PairingRequired>();
    expectTypeOf<{ actionType: string }>().toMatchTypeOf<ClientGatewayActionCommand>();
  });

  it("adds server.revoked and server.going_away as new message types", () => {
    const revoked: ClientGatewayServerMessage = { ...envelope, type: "server.revoked", payload: { reason: "revoked_by_user" } };
    const goingAway: ClientGatewayServerMessage = { ...envelope, type: "server.going_away", payload: { reason: "restart", retryAfterMs: 5_000 } };
    expect([revoked.type, goingAway.type]).toEqual(["server.revoked", "server.going_away"]);
  });

  it("carries a run context a client can check, without breaking a command that has none", () => {
    const runContext = { runId: "run-1", actorUserId: "u1", workspaceId: "ws-1", origin: "panel" as const, startedFromSessionId: "a".repeat(64) };
    const command: ClientGatewayActionCommand = { actionType: "synthetic.act", runContext };
    expect(parseClientGatewayRunContext(JSON.parse(JSON.stringify(command)).runContext)).toEqual(runContext);
    expect(parseClientGatewayRunContext(({ actionType: "synthetic.act" } as ClientGatewayActionCommand).runContext)).toBeNull();
  });

  it("stamps a version the contract describes, under the same major as 0.2", () => {
    expect(CLIENT_GATEWAY_PROTOCOL_VERSIONS).toContain(CLIENT_GATEWAY_PROTOCOL_VERSION);
    expect(CLIENT_GATEWAY_PROTOCOL_VERSION.split(".")[0]).toBe("0");
  });
});
