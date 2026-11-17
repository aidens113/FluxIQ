import { describe, expect, it } from "vitest";
import { ClientGatewayAuditLog } from "../../audit-log.ts";
import { ClientGatewayEventBus } from "../../event-bus.ts";
import { ClientGatewaySessionRegistry } from "../../sessions.ts";
import { ClientGatewayChangeFeed } from "../feed.ts";
import { CLIENT_GATEWAY_CHANGE_KINDS } from "../kinds.ts";
import type { ClientGatewayChange } from "../types.ts";

function feed() {
  const audit = new ClientGatewayAuditLog(() => 1_000);
  const events = new ClientGatewayEventBus();
  const sessions = new ClientGatewaySessionRegistry(() => 1_000);
  const changes = new ClientGatewayChangeFeed({ audit, events, sessions });
  const seen: ClientGatewayChange[] = [];
  changes.subscribe((change) => seen.push(change));
  return { audit, events, sessions, changes, seen };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("ClientGatewayChangeFeed", () => {
  it("delivers each change once the turn ends, numbered, as kind and version only", async () => {
    const { changes, seen } = feed();
    changes.signal("pairing.requested");
    expect(seen).toEqual([]);
    await turn();
    changes.signal("pairing.expired");
    await turn();
    expect(seen).toEqual([{ kind: "pairing.requested", version: 1 }, { kind: "pairing.expired", version: 2 }]);
    expect(seen.every((change) => Object.keys(change).sort().join() === "kind,version")).toBe(true);
    expect(changes.version()).toBe(2);
  });

  it("delivers the changes of one turn as one signal, named by the first", async () => {
    const { changes, seen } = feed();
    changes.signal("pairing.approved");
    changes.signal("client.connected");
    await turn();
    expect(seen).toEqual([{ kind: "pairing.approved", version: 1 }]);
  });

  it("signals the security events that change pairings or trust, and no other audit entry", async () => {
    const { audit, seen } = feed();
    audit.record("session.paired", "paired", { pairingCode: "123456", sessionId: "s1", trustedClientId: "t1" });
    await turn();
    audit.record("trust.revoked", "revoked", { trustedClientId: "t1" });
    await turn();
    audit.record("pairing.dismissed", "dismissed", { pairingCode: "123456" });
    await turn();
    audit.recordSecurity("trust.issued", "issued", { trustedClientId: "t2" });
    await turn();
    audit.record("session.connected", "connected", { sessionId: "s2" });
    audit.record("pairing.client_submit_rejected", "rejected", { sessionId: "s2" });
    await turn();
    expect(seen.map((change) => change.kind)).toEqual(["pairing.approved", "client.revoked", "pairing.denied", "client.paired"]);
    expect(JSON.stringify(seen)).not.toMatch(/123456|s1|s2|t1|t2/u);
  });

  it("signals sessions becoming ready and ending, but never one under a channel scope", async () => {
    const { events, sessions, seen } = feed();
    const live = sessions.create({});
    await events.emit({ type: "session.ready", session: sessions.toPublic(live) });
    await turn();
    await events.emit({ type: "session.disconnected", session: sessions.toPublic(live) });
    await turn();
    const scoped = sessions.create({});
    scoped.channelScope = "trial-1";
    await events.emit({ type: "session.disconnected", session: sessions.toPublic(scoped) });
    await turn();
    expect(seen.map((change) => change.kind)).toEqual(["client.connected", "client.disconnected"]);
  });

  it("keeps delivering to the other listeners when one throws, and audits the failure", async () => {
    const { audit, changes, seen } = feed();
    changes.subscribe(() => {
      throw new TypeError("listener broke");
    });
    changes.signal("client.revoked");
    await turn();
    expect(seen).toEqual([{ kind: "client.revoked", version: 1 }]);
    expect(audit.recent(1)[0]).toMatchObject({ type: "change_feed.listener_failed", metadata: { kind: "client.revoked", version: 1, error: "TypeError" } });
  });

  it("stops delivering to a listener that unsubscribed", async () => {
    const { changes, seen } = feed();
    const later: ClientGatewayChange[] = [];
    const unsubscribe = changes.subscribe((change) => later.push(change));
    unsubscribe();
    changes.signal("pairing.requested");
    await turn();
    expect(later).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it("names every kind it can signal in the published list", () => {
    expect(new Set(CLIENT_GATEWAY_CHANGE_KINDS).size).toBe(CLIENT_GATEWAY_CHANGE_KINDS.length);
    for (const kind of ["pairing.requested", "pairing.expired", "pairing.approved", "pairing.denied", "client.paired", "client.revoked", "client.connected", "client.disconnected"]) {
      expect(CLIENT_GATEWAY_CHANGE_KINDS).toContain(kind);
    }
  });
});
