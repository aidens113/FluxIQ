// The gateway 0.2 run context: `startedFromSessionId` is a digest or a
// gateway session reference, never a raw session id, and absent where no
// session started the work.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_LATEST_PROTOCOL_VERSION, CLIENT_GATEWAY_PROTOCOL_VERSIONS, parseClientGatewayRunContext } from "../index.ts";

const CONTEXT = { runId: "run-1", actorUserId: "u1", workspaceId: "ws-1", origin: "extension-chat", startedFromSessionId: "f".repeat(64) };

describe("client gateway run context", () => {
  it("accepts a panel session digest, a gateway session reference, or none", () => {
    expect(parseClientGatewayRunContext(CONTEXT)).toEqual(CONTEXT);
    const gateway = { ...CONTEXT, startedFromSessionId: "client-gateway:0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb" };
    expect(parseClientGatewayRunContext(gateway)).toEqual(gateway);
    const scheduled = { runId: "run-2", actorUserId: "u1", workspaceId: "ws-1", origin: "schedule" };
    expect(parseClientGatewayRunContext(scheduled)).toEqual(scheduled);
  });

  it("refuses a raw session id", () => {
    expect(parseClientGatewayRunContext({ ...CONTEXT, startedFromSessionId: "0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb" })).toBeNull();
    expect(parseClientGatewayRunContext({ ...CONTEXT, startedFromSessionId: "client-gateway:" })).toBeNull();
  });

  it("refuses missing identities and unknown origins", () => {
    expect(parseClientGatewayRunContext({ ...CONTEXT, actorUserId: "" })).toBeNull();
    expect(parseClientGatewayRunContext({ ...CONTEXT, origin: "website" })).toBeNull();
    const { runId: _runId, ...withoutRun } = CONTEXT;
    expect(parseClientGatewayRunContext(withoutRun)).toBeNull();
    expect(parseClientGatewayRunContext("run-1")).toBeNull();
  });

  it("drops fields it does not know", () => {
    expect(parseClientGatewayRunContext({ ...CONTEXT, later: 1 })).toEqual(CONTEXT);
  });

  it("describes 0.1 and 0.2 under one major version", () => {
    expect(CLIENT_GATEWAY_PROTOCOL_VERSIONS).toEqual(["0.1", "0.2"]);
    expect(CLIENT_GATEWAY_LATEST_PROTOCOL_VERSION).toBe("0.2");
    expect(new Set(CLIENT_GATEWAY_PROTOCOL_VERSIONS.map((version) => version.split(".")[0])).size).toBe(1);
  });
});
