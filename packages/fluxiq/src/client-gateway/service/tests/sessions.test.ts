import { describe, expect, it } from "vitest";
import type { ClientGatewayPeer } from "../security/index.ts";
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

// t802 W2b: the peer the transport read is kept on the internal record only.
describe("ClientGatewaySessionRegistry peer", () => {
  it("stores a copy of the peer and keeps it out of the public session", () => {
    const registry = new ClientGatewaySessionRegistry(() => 1_000);
    const peer: ClientGatewayPeer = { address: "203.0.113.45", prefix: "203.0.113.0/24", source: "forwarded" };
    const session = registry.create({ peer });
    peer.address = "198.51.100.1";

    expect(session.peer).toEqual({ address: "203.0.113.45", prefix: "203.0.113.0/24", source: "forwarded" });
    const view = registry.toPublic(session);
    expect(view).not.toHaveProperty("peer");
    expect(JSON.stringify(view)).not.toContain("203.0.113");
  });

  it("creates no peer field when none is given", () => {
    const registry = new ClientGatewaySessionRegistry(() => 1_000);
    expect(registry.create({})).not.toHaveProperty("peer");
  });
});

// t802 W2b: ended sessions are bounded; a dropped one still refuses as disconnected.
describe("ClientGatewaySessionRegistry ended-session retention", () => {
  it("keeps at most `limit` ended sessions, dropping the oldest-disconnected first", () => {
    let now = 1_000;
    const registry = new ClientGatewaySessionRegistry(() => now, { limit: 2 });
    const ids = [0, 1, 2].map(() => registry.create({}).sessionId);
    const live = registry.create({}).sessionId;
    // End them out of creation order: 1, then 0, then 2.
    for (const index of [1, 0, 2]) {
      now += 10;
      end(registry, ids[index]!, now);
    }

    expect(registry.get(ids[1]!)).toBeUndefined();
    expect(registry.get(ids[0]!)).toBeDefined();
    expect(registry.get(ids[2]!)).toBeDefined();
    expect(registry.get(live)).toBeDefined();
    expect(registry.list()).toHaveLength(3);
  });

  it("never drops a live session, however many there are", () => {
    const registry = new ClientGatewaySessionRegistry(() => 1_000, { limit: 1 });
    for (let index = 0; index < 50; index += 1) registry.create({});
    expect(registry.size()).toBe(50);
  });

  it("drops ended sessions older than `maxAgeMs` when one is set", () => {
    let now = 1_000;
    const registry = new ClientGatewaySessionRegistry(() => now, { maxAgeMs: 60_000 });
    const old = registry.create({}).sessionId;
    const recent = registry.create({}).sessionId;
    end(registry, old, now);
    now += 30_000;
    end(registry, recent, now);
    now += 30_001;

    expect(registry.list().map((session) => session.sessionId)).toEqual([recent]);
  });

  it("keeps old ended sessions by default, bounded by count only", () => {
    let now = 1_000;
    const registry = new ClientGatewaySessionRegistry(() => now);
    const id = registry.create({}).sessionId;
    end(registry, id, now);
    now += 365 * 24 * 60 * 60_000;
    expect(registry.list().map((session) => session.sessionId)).toEqual([id]);
  });

  it("refuses a dropped session's id as disconnected, as before it was dropped", () => {
    let now = 1_000;
    const registry = new ClientGatewaySessionRegistry(() => now, { limit: 1 });
    const dropped = registry.create({}).sessionId;
    const kept = registry.create({}).sessionId;
    end(registry, dropped, now);
    now += 1;
    end(registry, kept, now);

    expect(registry.get(dropped)).toBeUndefined();
    expect(() => registry.requireReady(kept)).toThrow("Client session is disconnected.");
    expect(() => registry.requireReady(dropped)).toThrow("Client session is disconnected.");
    expect(() => registry.require(dropped)).toThrow("Client session is disconnected.");
    expect(() => registry.require("never-known")).toThrow("Unknown client gateway session: never-known");
  });

  it("refuses an invalid retention", () => {
    expect(() => new ClientGatewaySessionRegistry(() => 1, { limit: 0 })).toThrow(/session_retention_invalid/);
    expect(() => new ClientGatewaySessionRegistry(() => 1, { maxAgeMs: -1 })).toThrow(/session_retention_invalid/);
  });
});

/** Ends a session the way `ClientGatewayLifecycle.disconnect` does: a replaced record with `disconnectedAt`. */
function end(registry: ClientGatewaySessionRegistry, sessionId: string, at: number): void {
  const session = registry.require(sessionId);
  registry.replace(sessionId, { ...session, status: "disconnected", disconnectedAt: at, lastSeenAt: at });
}
