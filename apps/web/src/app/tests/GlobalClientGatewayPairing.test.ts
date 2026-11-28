import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { closedPairingNotice, liveUpdatesNotice, pairingExpiryLabel, pairingRequestKey, pairingSnapshot, pairingSnapshotsEqual, pairingStillWaiting, pendingPairingRequests, vanishedPairingNotice, type ClientPairingRequest } from "../GlobalClientGatewayPairing";

const nowMs = 1_000_000;
const request = (overrides: Partial<ClientPairingRequest> = {}): ClientPairingRequest => ({
  pairingCode: "pair-1",
  requestedBySessionId: "session-1",
  expiresAt: nowMs + 30_000,
  ...overrides
});

describe("Global client pairing dismissal", () => {
  it("keeps only requested, unapproved pairings not answered here, in stable order", () => {
    const pairings = [
      request(),
      { pairingCode: "unrequested", expiresAt: nowMs + 30_000 },
      request({ pairingCode: "consumed", consumedAt: nowMs }),
      request({ pairingCode: "resolved" }),
      request({ pairingCode: "pair-2", requestedBySessionId: "session-2" })
    ];
    expect(pendingPairingRequests(pairings, ["resolved"]).map((item) => item.pairingCode)).toEqual(["pair-1", "pair-2"]);
  });

  // t1095 RC1: the gateway renews a lapsed code while its client waits. The
  // tab's own clock must not close the request in the moment before the
  // renewed code arrives; the gateway drops what has really ended.
  it("leaves a request past its expiry to the gateway, which renews or drops it", () => {
    expect(pendingPairingRequests([request({ expiresAt: nowMs - 1 })], []).map((item) => item.pairingCode)).toEqual(["pair-1"]);
  });

  it("treats a renewed code from the same client as the same request", () => {
    const shown = request();
    const renewed = request({ pairingCode: "pair-renewed" });
    expect(pairingRequestKey(renewed)).toBe(pairingRequestKey(shown));
    expect(pairingStillWaiting(shown, [renewed])).toBe(true);
    expect(pairingStillWaiting(shown, [request({ pairingCode: "other", requestedBySessionId: "session-2" })])).toBe(false);
    expect(pairingStillWaiting(shown, [])).toBe(false);
  });

  it("formats a live expiry countdown without negative values", () => {
    expect(pairingExpiryLabel(nowMs + 1_500, nowMs)).toBe("Expires in 2s");
    expect(pairingExpiryLabel(nowMs - 1, nowMs)).toBe("Expired");
  });

  it("keeps modal dismissal local and reserves rejection for the Reject action", () => {
    const source = readFileSync(new URL("../GlobalClientGatewayPairing.tsx", import.meta.url), "utf8");
    expect(source).toContain("onClose={dismissPairingPrompt}");
    expect(source).toContain('onClick={() => void resolvePairing("reject")}');
    expect(source).not.toContain('onClose={() => void resolvePairing("reject")}');
  });

  it("projects only pairing data and preserves equivalent snapshot identity", () => {
    const current = pairingSnapshot({
      sessions: [{ sessionId: "session-1", name: "Browser" }],
      pairings: [request()],
      webRuntime: { clientGatewayListening: true }
    });
    const next = pairingSnapshot({
      sessions: [{ sessionId: "session-1", name: "Browser" }],
      pairings: [request()],
      webRuntime: { clientGatewayListening: true }
    });
    expect(pairingSnapshotsEqual(current, next)).toBe(true);
  });

  it("mounts the poller only for authenticated users allowed to control runtime", () => {
    const layout = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('auth?.role.permissions.includes("runtime.control")');
    expect(layout).toContain("pairingEligible ? <GlobalClientGatewayPairing /> : null");
  });

  // t707 C2: when the browser left while the person read the code, the panel
  // must say so and keep saying so after the request drops out of the list.
  it("treats a refused or vanished approval as closed and keeps the gateway's reason", () => {
    const reason = "The browser disconnected before this pairing was approved, so nothing was paired. Reconnect from the browser to get a new code.";
    expect(closedPairingNotice(409, { error: reason, code: "pairing.client_disconnected" })).toBe(reason);
    expect(closedPairingNotice(404, { error: "Pairing request is no longer available." })).toBe("Pairing request is no longer available.");
    expect(closedPairingNotice(500, { error: "boom" })).toBeNull();
    expect(closedPairingNotice(409, { error: "conflict", code: "other.thing" })).toBeNull();
  });

  it("shows a closed approval's notice even once no request is pending", () => {
    const source = readFileSync(new URL("../GlobalClientGatewayPairing.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/if \(!pendingPairing\) return \([\s\S]*?\{closedNotice \? \(/u);
  });
  // t707 P2: a request the person was reading that disappears without their
  // approve or dismiss must not just vanish; the panel says why, honestly.
  it("explains a shown request that vanished without this operator acting on it", () => {
    const shown = request();
    const withdrawn = vanishedPairingNotice(shown, [], nowMs);
    expect(withdrawn.title).toBe("Nothing was paired");
    expect(withdrawn.message).toContain("nothing was paired");
    expect(withdrawn.message).toContain("Connect again from the browser");
    const expired = vanishedPairingNotice(request({ expiresAt: nowMs - 1 }), [], nowMs);
    expect(expired.title).toBe("Nothing was paired");
    expect(expired.message).toContain("expired");
    const approvedElsewhere = vanishedPairingNotice(shown, [request({ consumedAt: nowMs })], nowMs);
    expect(approvedElsewhere.title).toBe("Paired elsewhere");
    expect(approvedElsewhere.message).not.toContain("nothing was paired");
  });

  it("raises the vanished notice only for requests this operator did not resolve and that are not still waiting", () => {
    const source = readFileSync(new URL("../GlobalClientGatewayPairing.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (resolvedCodes.includes(shown.pairingCode)) return;");
    expect(source).toContain("if (pairingStillWaiting(shown, pending)) return;");
    expect(source).toContain("setClosedNotice(vanishedPairingNotice(shown, snapshot.pairings ?? [], Date.now()));");
  });

  // t916: the prompt hears pairing changes through the page's shared gateway
  // subscription; it reads nothing on a timer, and says so while not live.
  it("learns of requests by push and keeps only the countdown's local tick", () => {
    const source = readFileSync(new URL("../GlobalClientGatewayPairing.tsx", import.meta.url), "utf8");
    expect(source).toContain("useGatewayChanges()");
    expect(source).not.toContain("/api/client-gateway/snapshot");
    expect(source).not.toContain("setTimeout");
    expect(source.match(/setInterval/gu)).toHaveLength(1);
  });

  it("tells the person when live updates are down, and nothing while they are live", () => {
    expect(liveUpdatesNotice("live")).toBeNull();
    expect(liveUpdatesNotice("connecting")).toBeNull();
    expect(liveUpdatesNotice("reconnecting")).toMatch(/reconnecting/u);
    expect(liveUpdatesNotice("closed")).toMatch(/off/u);
  });
});

describe("Pairing dialog names the client", () => {
  it("titles the dialog with the browser's own name", async () => {
    const { pairingTitle, pairingClientName } = await import("../GlobalClientGatewayPairing");
    expect(pairingTitle(request({ requestedByClientName: "Chrome on Windows" }))).toBe("Chrome on Windows wants to connect");
    expect(pairingClientName(request(), "Edge on Mac")).toBe("Edge on Mac");
    expect(pairingTitle(request())).toBe("A browser wants to connect");
    expect(pairingTitle(request({ requestedByClientName: "  " }))).toBe("A browser wants to connect");
  });
});
