import { describe, expect, it } from "vitest";
import { ClientGatewaySessionRegistry } from "../sessions.ts";

// t707 C3: a session whose socket is gone must never take a command, even if
// something left it marked `ready`; the command fails at once instead of
// waiting for an answer that cannot come.
describe("ClientGatewaySessionRegistry", () => {
  it("refuses a ready session whose socket has gone", () => {
    const registry = new ClientGatewaySessionRegistry(() => 1_000);
    const session = registry.create({ hello: { clientId: "extension.orphan", clientType: "extension" } });
    session.status = "ready";
    session.trustedClientId = "trusted.orphan";
    session.disconnectedAt = 900;

    expect(() => registry.requireReady(session.sessionId)).toThrow(/disconnected/i);
    expect(registry.findReadyByTrustedClient("trusted.orphan")).toBeUndefined();
    // Still listed for revoking or replacing, which marks it disconnected.
    expect(registry.listReadyByTrustedClient("trusted.orphan")).toEqual([session]);
  });

  it("still returns a live ready session", () => {
    const registry = new ClientGatewaySessionRegistry(() => 1_000);
    const session = registry.create({ hello: { clientId: "extension.live", clientType: "extension" } });
    session.status = "ready";
    session.trustedClientId = "trusted.live";

    expect(registry.requireReady(session.sessionId)).toBe(session);
    expect(registry.findReadyByTrustedClient("trusted.live")).toBe(session);
  });
});
