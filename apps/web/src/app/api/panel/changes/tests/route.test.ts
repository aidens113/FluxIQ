import { AutomationStudioConversationSignalHub, automationStudioActivityHub } from "fluxiq/automation";
import type { ClientGatewayChange, ClientGatewayChangeListener, ClientGatewaySession, ClientGatewayTrustedClientView } from "fluxiq/client-gateway";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRequest, snapshotRuntime } from "../../../client-gateway/snapshot/tests/snapshot-runtime";
import { GET } from "../route";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  const { snapshotRuntime } = await import("../../../client-gateway/snapshot/tests/snapshot-runtime");
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
const changesRequest = (options: Parameters<typeof snapshotRequest>[0] = {}) => snapshotRequest({ url: "https://panel.example.test/api/panel/changes?domainId=domain-a", ...options });
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

// Each workspace's own Core signals; a test writes to them as a run's turn would.
let threadsA = new AutomationStudioConversationSignalHub();
let threadsB = new AutomationStudioConversationSignalHub();

beforeEach(async () => {
  await resetSnapshotRuntime();
  listeners.clear();
  gatewayVersion = 100;
  threadsA = new AutomationStudioConversationSignalHub();
  threadsB = new AutomationStudioConversationSignalHub();
  // The snapshot runtime gave each workspace its Automation Studio; this gives it Core's conversation signals,
  // and which projects its own catalogue holds (the snapshot runtime's project list for that workspace).
  for (const [instance, signals, tenant] of [[runtime.tenantA, threadsA, "a"], [runtime.tenantB, threadsB, "b"]] as const) {
    const held = { holds: async (projectId: string) => snapshotRuntime.projects.get(tenant)?.some((entry) => entry.id === projectId) ?? false };
    Object.assign((instance.programs as unknown as { automationStudio: object }).automationStudio, { conversations: { signals }, projects: { held } });
  }
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

describe("GET /api/panel/changes: the gateway topic", () => {
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
    expect(event).toBe('event: gateway\ndata: {"version":1}\n\n');
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
      expect(await next).toBe('event: gateway\ndata: {"version":1}\n\n');
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
      expect(await next).toBe('event: gateway\ndata: {"version":1}\n\n');
      await reader.cancel();
    });
  });

  it("still tells an unfiltered panel caller of a pairing request and its approval", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { reader } = await open(changesRequest());

    let next = chunk(reader);
    view().pairings.push({ pairingCode: "private-new-code", expiresAt: 40000, userId: "person-a", requestedBySessionId: "gateway-new" });
    signal("pairing.requested");
    expect(await next).toBe('event: gateway\ndata: {"version":1}\n\n');

    next = chunk(reader);
    view().pairings.pop();
    view().trustedClients.push(trust("trust-approved", "person-a"));
    signal("pairing.approved");
    expect(await next).toBe('event: gateway\ndata: {"version":2}\n\n');
    await reader.cancel();
  });

  it("gives a signal that changed nothing the caller can see no event, and the next change the next number", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { reader } = await open(changesRequest());
    await signalAndSettle("client.disconnected");
    const next = chunk(reader);
    view().pairings.push({ pairingCode: "private-late-code", expiresAt: 50000, userId: "person-a", requestedBySessionId: "gateway-a" });
    signal("pairing.requested");
    expect(await next).toBe('event: gateway\ndata: {"version":1}\n\n');
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

describe("GET /api/panel/changes: threads and activity", () => {
  const activityListeners = new Set<(event: { subject: { projectId: string } }) => void>();
  const activity = (projectId: string) => {
    for (const listener of [...activityListeners]) listener({ subject: { projectId } });
  };
  const project = (id: string, ownerUserId: string) => snapshotRuntime.projects.get("a")!.push({ id, name: id, domainId: "domain-a", ownerUserId, updatedAt: 3 });

  beforeEach(() => {
    activityListeners.clear();
    vi.spyOn(automationStudioActivityHub, "subscribe").mockImplementation((listener) => {
      const heard = listener as unknown as (event: { subject: { projectId: string } }) => void;
      activityListeners.add(heard);
      return () => {
        activityListeners.delete(heard);
      };
    });
    // Who owns each project, for a hosted user's own-data policy.
    runtime.tenantA.programs.api.registerResourceOwners("project", { ownerOf: async (id) => snapshotRuntime.projects.get("a")?.find((entry) => entry.id === id)?.ownerUserId ?? null });
  });

  /** Opens a stream and reads its opening comment; the thread and activity topics listen from then on. */
  async function openTopics(request: Request, streams = 1) {
    const response = await GET(request);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect(await chunk(reader)).toBe(": open\n\n");
    await vi.waitFor(() => expect(activityListeners.size).toBe(streams));
    return reader;
  }

  it("tells a panel caller which thread to read again when one of its project's threads changed, and nothing it said", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const reader = await openTopics(changesRequest());
    const next = chunk(reader);
    threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
    const event = await next;
    expect(event).toBe('event: conversation\ndata: {"conversationId":"conversation.mine","version":1}\n\n');
    expect(event).not.toMatch(/same-project|person-a|tenant/u);
    await reader.cancel();
    await vi.waitFor(() => expect(runtime.releases.a).toHaveBeenCalledOnce());
    expect(activityListeners.size).toBe(0);
  });

  it("tells a panel caller which project's activity to read again, once per burst", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const reader = await openTopics(changesRequest());
    activity("same-project");
    activity("same-project");
    activity("same-project");
    await flush();
    await flush();
    expect(await chunk(reader)).toBe('event: activity\ndata: {"projectId":"same-project","version":1}\n\n');
    const next = chunk(reader);
    threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
    // The burst was one event: the next is the thread, numbered 2.
    expect(await next).toBe('event: conversation\ndata: {"conversationId":"conversation.mine","version":2}\n\n');
    await reader.cancel();
  });

  it("never tells a caller of a thread in another workspace", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const reader = await openTopics(changesRequest());
    threadsB.signal({ kind: "project", projectId: "same-project" }, "conversation.tenant-b");
    await flush();
    const next = chunk(reader);
    threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
    expect(await next).toBe('event: conversation\ndata: {"conversationId":"conversation.mine","version":1}\n\n');
    await reader.cancel();
  });

  it("never tells a caller of another person's panel thread, and tells them of their own", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const reader = await openTopics(changesRequest());
    threadsA.signal({ kind: "panel", userId: "person-b" }, "conversation.of-b");
    await flush();
    const next = chunk(reader);
    threadsA.signal({ kind: "panel", userId: "person-a" }, "conversation.of-a");
    expect(await next).toBe('event: conversation\ndata: {"conversationId":"conversation.of-a","version":1}\n\n');
    await reader.cancel();
  });

  it("never tells a caller of a thread in a project outside its domain", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    snapshotRuntime.projects.get("a")!.push({ id: "other-domain-project", name: "Other", domainId: "domain-other", ownerUserId: "person-a", updatedAt: 3 });
    const reader = await openTopics(changesRequest());
    threadsA.signal({ kind: "project", projectId: "other-domain-project" }, "conversation.other-domain");
    await vi.waitFor(() => expect(snapshotRuntime.domains.a).toHaveBeenCalledWith("other-domain-project", "domain-a"));
    await flush();
    const next = chunk(reader);
    threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
    expect(await next).toBe('event: conversation\ndata: {"conversationId":"conversation.mine","version":1}\n\n');
    await reader.cancel();
  });

  describe("for a hosted user, who may read only their own projects and not the gateway snapshot", () => {
    beforeEach(() => {
      vi.stubEnv("FLUXIQ_PROFILE", "service");
      runtime.policies.set("tenant-a", "user");
      project("own-project", "person-a");
      project("foreign-project", "person-foreign");
    });

    it("streams their threads and activity, without the gateway topic", async () => {
      const reader = await openTopics(changesRequest());
      expect(listeners.size).toBe(0);
      const next = chunk(reader);
      threadsA.signal({ kind: "project", projectId: "own-project" }, "conversation.own");
      expect(await next).toBe('event: conversation\ndata: {"conversationId":"conversation.own","version":1}\n\n');
      await reader.cancel();
    });

    it("never tells them of a thread, or activity, in another person's project", async () => {
      const reader = await openTopics(changesRequest());
      threadsA.signal({ kind: "project", projectId: "foreign-project" }, "conversation.foreign");
      activity("foreign-project");
      await flush();
      await flush();
      const next = chunk(reader);
      activity("own-project");
      expect(await next).toBe('event: activity\ndata: {"projectId":"own-project","version":1}\n\n');
      const after = chunk(reader);
      threadsA.signal({ kind: "project", projectId: "own-project" }, "conversation.own");
      expect(await after).toBe('event: conversation\ndata: {"conversationId":"conversation.own","version":2}\n\n');
      await reader.cancel();
    });
  });

  it("never names another workspace's project's activity, though both share the process's hub and the caller's policy allows every project", async () => {
    // Service profile, administrator policy on both workspaces: `studio:*` on every resource, so IAM alone would allow it.
    snapshotRuntime.projects.get("b")!.push({ id: "b-only-project", name: "B's", domainId: "domain-b", ownerUserId: "person-b", updatedAt: 3 });
    Object.assign(runtime.tenantB.programs.clientGateway, { changes: { subscribe: () => () => undefined, version: () => 0 } });
    const readerA = await openTopics(changesRequest());
    const readerB = await openTopics(snapshotRequest({ cookie: runtime.sessions.b, url: "https://panel.example.test/api/panel/changes?domainId=domain-b" }), 2);
    activity("b-only-project");
    expect(await chunk(readerB)).toBe('event: activity\ndata: {"projectId":"b-only-project","version":1}\n\n');
    const nextA = chunk(readerA);
    activity("same-project");
    // A's first event is its own project's, numbered 1: B's never reached it.
    expect(await nextA).toBe('event: activity\ndata: {"projectId":"same-project","version":1}\n\n');
    await readerA.cancel();
    await readerB.cancel();
  });

  describe("the model-access topic, from each workspace's own runtime", () => {
    /** A source like the one the program runtime holds as `modelAccessChanges`, counting who listens. */
    const source = () => {
      const heard = new Set<() => void>();
      return {
        heard,
        signal: () => {
          for (const listener of [...heard]) listener();
        },
        modelAccessChanges: {
          subscribe: (listener: () => void) => {
            heard.add(listener);
            return () => {
              heard.delete(listener);
            };
          }
        }
      };
    };
    const hold = (instance: object, held: { modelAccessChanges: object } | undefined) => {
      if (held) Object.assign(instance, { modelAccessChanges: held.modelAccessChanges });
      else delete (instance as { modelAccessChanges?: unknown }).modelAccessChanges;
    };
    beforeEach(() => vi.stubEnv("FLUXIQ_PROFILE", "local"));
    afterEach(() => {
      hold(runtime.tenantA.programs, undefined);
      hold(runtime.tenantB.programs, undefined);
    });

    it("tells a panel caller to read model access again when its workspace's runtime signals, and never another workspace's", async () => {
      const a = source();
      const b = source();
      hold(runtime.tenantA.programs, a);
      hold(runtime.tenantB.programs, b);
      const reader = await openTopics(changesRequest());
      expect([a.heard.size, b.heard.size]).toEqual([1, 0]);
      b.signal();
      await flush();
      const next = chunk(reader);
      a.signal();
      a.signal();
      expect(await next).toBe('event: model-access\ndata: {"version":1}\n\n');
      await reader.cancel();
      await vi.waitFor(() => expect(runtime.releases.a).toHaveBeenCalledOnce());
      expect(a.heard.size).toBe(0);
    });

    it("subscribes to nothing, and streams the other topics as before, while the runtime has no model-access signal", async () => {
      hold(runtime.tenantA.programs, { modelAccessChanges: { subscribe: "not a function" } });
      const reader = await openTopics(changesRequest());
      const next = chunk(reader);
      threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
      expect(await next).toBe('event: conversation\ndata: {"conversationId":"conversation.mine","version":1}\n\n');
      await reader.cancel();
      hold(runtime.tenantA.programs, undefined);
      const again = await openTopics(changesRequest());
      const after = chunk(again);
      threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
      expect(await after).toBe('event: conversation\ndata: {"conversationId":"conversation.mine","version":1}\n\n');
      await again.cancel();
    });

    it("tells a paired browser nothing of it: model access reaches it over the gateway socket", async () => {
      const a = source();
      hold(runtime.tenantA.programs, a);
      const { reader } = await open(paired());
      expect(a.heard.size).toBe(0);
      await reader.cancel();
    });
  });

  it("tells a paired browser of no thread or activity: those reach it over the gateway socket", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const { reader } = await open(paired());
    expect(activityListeners.size).toBe(0);
    threadsA.signal({ kind: "project", projectId: "same-project" }, "conversation.mine");
    await flush();
    const next = chunk(reader);
    const own = view().sessions.find((candidate) => candidate.sessionId === "gateway-a")!;
    own.lastSeenAt = 700;
    signal("client.connected");
    expect(await next).toBe('event: gateway\ndata: {"version":1}\n\n');
    await reader.cancel();
  });
});
