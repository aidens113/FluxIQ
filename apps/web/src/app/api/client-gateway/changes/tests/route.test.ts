import type { ClientGatewayChange, ClientGatewayChangeListener, ClientGatewaySession, ClientGatewayTrustedClientView } from "fluxiq/client-gateway";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRequest, snapshotRuntime } from "../../snapshot/tests/snapshot-runtime";
import { GET } from "../route";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  const { snapshotRuntime } = await import("../../snapshot/tests/snapshot-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getWorkspaceWebPresentation: runtime.presenter, getFluxIQWebRuntimeStatus: () => { throw new Error("Unexpected primary presentation"); }, isCurrentFluxIQPrimary: (instance: unknown) => snapshotRuntime.primaryCurrent && instance === runtime.primary };
});
vi.mock("../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

const listeners = new Set<ClientGatewayChangeListener>();
let gatewayVersion = 100;
const signal = (kind: ClientGatewayChange["kind"] = "client.connected") => {
  gatewayVersion += 1;
  for (const listener of [...listeners]) listener({ kind, version: gatewayVersion });
};
const changesRequest = (options: Parameters<typeof snapshotRequest>[0] = {}) => snapshotRequest({ url: "https://panel.example.test/api/client-gateway/changes?domainId=domain-a", ...options });
const paired = () => changesRequest({ cookie: null, bearer: "browser-a-token" });
const decoder = new TextDecoder();

async function chunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const read = await reader.read();
  return read.done ? "" : decoder.decode(read.value);
}

const view = () => snapshotRuntime.views.get("a")!;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Signals, then waits until the stream has looked at the caller's view again, so "no event" is not just "not yet". */
async function signalAndSettle(kind?: ClientGatewayChange["kind"]) {
  const before = snapshotRuntime.snapshots.a.mock.calls.length;
  signal(kind);
  await vi.waitFor(() => expect(snapshotRuntime.snapshots.a.mock.calls.length).toBeGreaterThan(before));
  await flush();
  await flush();
}

const trust = (trustedClientId: string, approvedByUserId: string): ClientGatewayTrustedClientView => ({ ...view().trustedClients[0]!, trustedClientId, clientId: `client-${trustedClientId}`, approvedByUserId });
const session = (sessionId: string, operatorUserId: string): ClientGatewaySession => ({ ...view().sessions[0]!, sessionId, clientId: `client-${sessionId}`, operatorUserId });

beforeEach(async () => {
  await resetSnapshotRuntime();
  listeners.clear();
  gatewayVersion = 100;
  Object.assign(runtime.tenantA.programs.clientGateway, {
    changes: {
      subscribe: (listener: ClientGatewayChangeListener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      version: () => gatewayVersion
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

/** Opens a stream, reads its opening comment, and waits for its first view of the caller to be taken. */
async function open(request: Request) {
  const response = await GET(request);
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  expect(await chunk(reader)).toBe(": open\n\n");
  await vi.waitFor(() => expect(listeners.size).toBe(1));
  await flush();
  return { response, reader };
}

describe("GET /api/client-gateway/changes", () => {
  it("gives an unauthenticated request no stream and holds no workspace", async () => {
    for (const request of [changesRequest({ cookie: null }), changesRequest({ cookie: "invalid" }), changesRequest({ cookie: null, bearer: "invalid" })]) {
      const response = await GET(request);
      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    }
    expect(listeners.size).toBe(0);
  });

  it("gives a caller the snapshot would refuse no stream, and releases the workspace", async () => {
    runtime.policies.set("tenant-a", "none");
    const response = await GET(changesRequest());
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    expect(listeners.size).toBe(0);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("streams an unbuffered, uncached event with a per-stream sequence only, when the caller's own view changed", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { response, reader } = await open(changesRequest());
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");

    const next = chunk(reader);
    view().pairings.push({ pairingCode: "private-second-code", expiresAt: 20000, userId: "person-a", requestedBySessionId: "gateway-a" });
    signal("pairing.requested");
    const event = await next;
    // The gateway's own version (101) and the change's kind never reach the wire.
    expect(event).toBe('event: change\ndata: {"version":1}\n\n');
    expect(event).not.toMatch(/gateway-a|browser-a|trust-a|person-a|private-|101|pairing\.requested/u);

    await reader.cancel();
    await vi.waitFor(() => expect(runtime.releases.a).toHaveBeenCalledOnce());
    expect(listeners.size).toBe(0);
  });

  describe.each([["a service-profile panel user", () => changesRequest(), "service"], ["a paired browser", paired, "local"]] as const)("for %s, whose snapshot is filtered", (_name, request, profile) => {
    beforeEach(() => vi.stubEnv("FLUXIQ_PROFILE", profile));

    it("hears nothing of another person's client being paired, connected or revoked, and hears of their own", async () => {
      const { reader } = await open(request());
      const foreign = trust("trust-foreign-new", "person-foreign");
      const foreignSession = session("gateway-foreign-new", "person-foreign");
      // Paired.
      view().trustedClients.push(foreign);
      await signalAndSettle("client.paired");
      // Connected.
      view().sessions.push(foreignSession);
      await signalAndSettle("client.connected");
      // Revoked.
      foreign.status = "revoked";
      await signalAndSettle("client.revoked");
      // Disconnected.
      foreignSession.status = "disconnected";
      await signalAndSettle("client.disconnected");

      // The first event the caller hears is the first change to their own view, numbered 1.
      const next = chunk(reader);
      const own = view().trustedClients.find((client) => client.trustedClientId === "trust-a")!;
      own.name = "Renamed by its owner";
      own.updatedAt = 99;
      signal("client.revoked");
      expect(await next).toBe('event: change\ndata: {"version":1}\n\n');
      await reader.cancel();
    });

    it("hears nothing of a pairing request", async () => {
      const { reader } = await open(request());
      view().pairings.push({ pairingCode: "private-another-code", expiresAt: 30000, userId: "person-a", requestedBySessionId: "gateway-a" });
      await signalAndSettle("pairing.requested");
      view().pairings.length = 0;
      await signalAndSettle("pairing.denied");

      const next = chunk(reader);
      const own = view().sessions.find((candidate) => candidate.sessionId === "gateway-a")!;
      own.lastSeenAt = 500;
      signal("client.connected");
      expect(await next).toBe('event: change\ndata: {"version":1}\n\n');
      await reader.cancel();
    });
  });

  it("still tells an unfiltered panel caller of a pairing request and its approval", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { reader } = await open(changesRequest());

    let next = chunk(reader);
    view().pairings.push({ pairingCode: "private-new-code", expiresAt: 40000, userId: "person-a", requestedBySessionId: "gateway-new" });
    signal("pairing.requested");
    expect(await next).toBe('event: change\ndata: {"version":1}\n\n');

    next = chunk(reader);
    view().pairings.pop();
    view().trustedClients.push(trust("trust-approved", "person-a"));
    signal("pairing.approved");
    expect(await next).toBe('event: change\ndata: {"version":2}\n\n');
    await reader.cancel();
  });

  it("gives a signal that changed nothing the caller can see no event, and the next change the next number", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { reader } = await open(changesRequest());
    await signalAndSettle("client.disconnected");
    const next = chunk(reader);
    view().pairings.push({ pairingCode: "private-late-code", expiresAt: 50000, userId: "person-a", requestedBySessionId: "gateway-a" });
    signal("pairing.requested");
    expect(await next).toBe('event: change\ndata: {"version":1}\n\n');
    await reader.cancel();
  });

  it("serves a paired browser as the snapshot does", async () => {
    const response = await GET(paired());
    expect(response.status).toBe(200);
    await response.body!.cancel();
    await vi.waitFor(() => expect(runtime.releases.a).toHaveBeenCalledOnce());
  });

  it("ends the stream without sending a change once the caller's authority lapses", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { reader } = await open(changesRequest());
    const next = reader.read();
    runtime.policies.set("tenant-a", "none");
    view().pairings.push({ pairingCode: "private-lapse-code", expiresAt: 60000, userId: "person-a", requestedBySessionId: "gateway-a" });
    signal("pairing.requested");
    await expect(next).rejects.toBeDefined();
    await vi.waitFor(() => expect(runtime.releases.a).toHaveBeenCalledOnce());
    expect(listeners.size).toBe(0);
  });
});
