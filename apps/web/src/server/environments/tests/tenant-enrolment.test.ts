// A dedicated environment's client enrols at its own tenant's gateway with a
// ticket that tenant minted, under the hosted routing, and nowhere else: real
// gateways over one durable trust repository, a real environment store, the
// controller with the fake driver, and the hosted route resolver.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, FLUXIQ_MANAGED_HOST_PRINCIPAL } from "fluxiq/client-gateway";
import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import {
  createSqliteClientTrustRepository,
  dedicatedEnvironmentTarget,
  EnvironmentEnrolmentRoutes,
  environmentHostId,
  FakeEnvironmentDriver,
  SQLiteEnvironmentStore
} from "fluxiq/platform";
import type { ClientTrustBinding, CommerceAdmissionDecision, CommerceAdmissionRequest, CommerceExecutionAuthority } from "fluxiq/platform";
import type { WorkspaceLease } from "../../../lib/workspaces";
import { resolveTrustedClientRoute } from "../../browser-trust";
import { authorizeEnvironmentBinding } from "../authorize-environment-binding";
import { composeEnvironmentController } from "../compose-controller";
import { resolveEnvironmentEnrolmentRoute } from "../resolve-enrolment-route";
import { createTenantEnrolment } from "../tenant-enrolment";

const WEB = "web";
const PRIMARY = "workspace-main";

type Actor = { accountId: string; workspaceId: string };
const actorA: Actor = { accountId: "account-a", workspaceId: "tenant-a" };
const actorB: Actor = { accountId: "account-b", workspaceId: "tenant-b" };
const owners = new Map<string, Actor>([["env-a", actorA], ["env-b", actorB]]);

/** The server's IAM resolver: the actor must hold the workspace that owns the environment. */
async function authorize(request: CommerceAdmissionRequest<Actor>): Promise<CommerceExecutionAuthority | null> {
  const owner = owners.get(request.targetId);
  if (!owner || owner.workspaceId !== request.workspaceId || request.actor.workspaceId !== request.workspaceId || request.actor.accountId !== owner.accountId) return null;
  return {
    principalId: `person-${owner.accountId}`, accountId: owner.accountId, workspaceId: request.workspaceId,
    target: dedicatedEnvironmentTarget({ environmentId: request.targetId, accountId: owner.accountId, workspaceId: owner.workspaceId }, "region-a"),
    cloudAuthorization: { accountId: owner.accountId, workspaceId: request.workspaceId }
  };
}

/** A paid dedicated entitlement for every environment its owner holds. */
const admission = {
  admit: async (request: CommerceAdmissionRequest<Actor>): Promise<CommerceAdmissionDecision> => {
    const authority = await authorize(request);
    if (!authority) return { allowed: false, reason: "not-authorized" };
    return {
      allowed: true, source: "commerce", allocation: "dedicated", principalId: authority.principalId, accountId: authority.accountId,
      workspaceId: authority.workspaceId, targetId: request.targetId, capability: request.capability, policyId: "policy-1",
      entitlementKey: "cloud.dedicated", providerId: "fixture-provider", subscriptionId: "subscription-1", subscriptionVersion: 1, validUntilMs: Number.MAX_SAFE_INTEGER
    };
  }
};

const directories: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function world(options: { ttlMs?: number } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-environment-enrolment-"));
  directories.push(directory);
  const repository = createSqliteClientTrustRepository({ filePath: path.join(directory, "trust.sqlite") });
  closers.push(() => repository.close());
  const store = new SQLiteEnvironmentStore({ rootDir: path.join(directory, "environments") });
  const routes = new EnvironmentEnrolmentRoutes();
  const gateways = new Map<string, ClientGatewayService>();
  for (const workspaceId of [PRIMARY, "tenant-a", "tenant-b"]) {
    const gateway = new ClientGatewayService({
      trustedClientStore: repository.scopedStore(workspaceId),
      trustAuthority: {
        validateApproval: async ({ userId, approvingSessionDigest }) => ({ userId, approvingSessionDigest, maxActiveClients: 10 }),
        grantCredential: async () => undefined
      }
    });
    await gateway.ready();
    gateways.set(workspaceId, gateway);
  }
  const leases = { held: 0, acquired: [] as string[] };
  const acquire = async (workspaceId: string): Promise<WorkspaceLease> => {
    const gateway = gateways.get(workspaceId);
    if (!gateway) throw new Error(`Unexpected workspace ${workspaceId}`);
    leases.held += 1;
    leases.acquired.push(workspaceId);
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      leases.held -= 1;
    };
    return { workspaceId, fluxiq: { programs: { clientGateway: gateway } }, release } as unknown as WorkspaceLease;
  };
  const driver = new FakeEnvironmentDriver();
  const controller = composeEnvironmentController<Actor>({
    profile: "local", admission, authorize, driver, domainId: WEB, store, acquire, routes,
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {})
  });
  const environmentAuthority = (binding: ClientTrustBinding) => authorizeEnvironmentBinding(binding, { store, primaryWorkspaceId: PRIMARY });
  /** The hosted router as `service-route.ts` composes it, with ordinary people's bindings refused here. */
  const route = (hello: ClientGatewayClientHello) => resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, {
    repository, primaryWorkspaceId: PRIMARY, acquire,
    authorize: async (binding) => binding.managedHost !== undefined && await environmentAuthority(binding),
    enrolment: (input) => resolveEnvironmentEnrolmentRoute(input, { routes, store, primaryWorkspaceId: PRIMARY, acquire })
  });
  return { repository, store, routes, gateways, leases, acquire, driver, controller, environmentAuthority, route, gateway: (id: string) => gateways.get(id)! };
}

let helloCount = 0;

/** A client says hello to one gateway over a socket that keeps what it was sent. */
async function connect(gateway: ClientGatewayService, payload: ClientGatewayClientHello) {
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const closed: string[] = [];
  const session = gateway.connect({ socket: { send: (raw: string) => { sent.push(JSON.parse(raw)); }, close: (_code?: number, reason?: string) => { closed.push(reason ?? ""); } } });
  helloCount += 1;
  await gateway.receive(session.sessionId, { id: `hello-${helloCount}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload });
  const ready = sent.find((message) => message.type === "server.session_ready");
  const error = sent.find((message) => message.type === "server.error");
  return {
    sessionId: session.sessionId,
    closed,
    token: typeof ready?.payload.token === "string" ? ready.payload.token : undefined,
    error: typeof error?.payload.code === "string" ? error.payload.code : undefined
  };
}

const runnerHello = (ticket: string, extra: Partial<ClientGatewayClientHello> = {}): ClientGatewayClientHello => ({
  clientId: "environment-runner", clientType: "extension", name: "Environment runner", enrolmentTicket: ticket, metadata: { domainId: WEB }, ...extra
});

function managedTrusts(gateway: ClientGatewayService) {
  return gateway.snapshot().trustedClients.filter((client) => client.managedHost !== undefined && client.revokedAt === undefined);
}

describe("tenant-bound enrolment of a dedicated environment's client", () => {
  it("routes the minted ticket to its own tenant, enrols the client there, and the proved binding carries the environment", async () => {
    const w = await world();
    await w.controller.create({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-create" });
    const ticket = w.driver.tickets.get("env-a")!;
    expect(ticket).toMatch(/^fxet_/u);
    const routed = await w.route(runnerHello(ticket));
    expect(routed?.gateway).toBe(w.gateway("tenant-a"));
    const enrolled = await connect(routed!.gateway, runnerHello(ticket));
    expect(enrolled.error).toBeUndefined();
    expect(enrolled.token).toBeDefined();
    routed!.release();
    const session = w.gateway("tenant-a").snapshot().sessions.find((entry) => entry.sessionId === enrolled.sessionId);
    expect(session).toMatchObject({ status: "ready", managedHostId: environmentHostId("env-a") });
    const proof = await w.repository.lookupCredential(enrolled.token!);
    expect(proof.status).toBe("current");
    if (proof.status === "invalid") throw new Error("Expected a proved credential");
    expect(proof.binding).toMatchObject({ workspaceId: "tenant-a", approvedByUserId: FLUXIQ_MANAGED_HOST_PRINCIPAL, managedHost: { hostId: environmentHostId("env-a"), profile: "named" } });
    expect(await w.environmentAuthority(proof.binding)).toBe(true);
    // Its stored credential reconnects to its own tenant while the environment runs.
    const again = await w.route({ clientId: "environment-runner", clientType: "extension", token: enrolled.token!, metadata: { domainId: WEB } });
    expect(again?.gateway).toBe(w.gateway("tenant-a"));
    again?.release();
    expect(managedTrusts(w.gateway("tenant-b"))).toHaveLength(0);
    expect(managedTrusts(w.gateway(PRIMARY))).toHaveLength(0);
  });

  it("never lets a ticket for workspace A open workspace B", async () => {
    const w = await world();
    await w.controller.create({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-a" });
    await w.controller.create({ actor: actorB, workspaceId: "tenant-b", environmentId: "env-b", operationId: "op-b" });
    const ticketA = w.driver.tickets.get("env-a")!;
    // Presented straight to B's gateway, A's ticket is unknown there and enrols nothing.
    const atB = await connect(w.gateway("tenant-b"), runnerHello(ticketA));
    expect(atB.error).toBe("enrolment.unknown");
    expect(atB.token).toBeUndefined();
    expect(managedTrusts(w.gateway("tenant-b")).filter((client) => client.managedHost?.hostId === environmentHostId("env-a"))).toHaveLength(0);
    // Through the router, the ticket alone chooses the tenant, whatever else the hello carries.
    const acquiredBefore = w.leases.acquired.length;
    const enrolledB = await connect(w.gateway("tenant-b"), runnerHello(w.driver.tickets.get("env-b")!));
    const routed = await w.route(runnerHello(ticketA, { token: enrolledB.token!, metadata: { domainId: WEB, workspaceId: "tenant-b" } }));
    expect(routed?.gateway).toBe(w.gateway("tenant-a"));
    expect(w.leases.acquired.slice(acquiredBefore)).toEqual(["tenant-a"]);
    routed?.release();
    // A tenant's gateway never mints for another tenant's environment.
    const enrolment = createTenantEnrolment({ acquire: w.acquire, store: w.store, routes: w.routes, domainId: WEB });
    const held = w.leases.held;
    await expect(enrolment.open({ environmentId: "env-b", accountId: "account-a", workspaceId: "tenant-a" })).rejects.toThrow("enrolment_not_running");
    expect(w.leases.held).toBe(held);
    // Nor does the controller let A's actor act on B's environment.
    await expect(w.controller.start({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-b", operationId: "op-steal" })).rejects.toMatchObject({ code: "admission-refused" });
  });

  it("refuses a forged ticket without opening any tenant, and a replayed ticket at its tenant", async () => {
    const w = await world();
    await w.controller.create({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-create" });
    const ticket = w.driver.tickets.get("env-a")!;
    const acquiredBefore = w.leases.acquired.length;
    expect(await w.route(runnerHello("fxet_forgedforgedforgedforgedforgedforgedforg"))).toBeNull();
    expect(await w.route(runnerHello(`${ticket}x`))).toBeNull();
    expect(w.leases.acquired.length).toBe(acquiredBefore);
    const first = await connect(w.gateway("tenant-a"), runnerHello(ticket));
    expect(first.token).toBeDefined();
    const replay = await w.route(runnerHello(ticket));
    expect(replay?.gateway).toBe(w.gateway("tenant-a"));
    const replayed = await connect(replay!.gateway, runnerHello(ticket, { clientId: "someone-else" }));
    replay?.release();
    expect(replayed.error).toBe("enrolment.used");
    expect(replayed.token).toBeUndefined();
    expect(replayed.closed.length).toBeGreaterThan(0);
    expect(managedTrusts(w.gateway("tenant-a"))).toHaveLength(1);
  });

  it("refuses an expired ticket at the router and at its tenant", async () => {
    const w = await world({ ttlMs: 20 });
    // Only the clock is controlled: an ended ticket is remembered for one more
    // lifetime (to say why it is refused), so the check must land between its
    // expiry (20 ms) and its forgetting (40 ms), whatever the machine's speed.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await w.controller.create({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-create" });
      const ticket = w.driver.tickets.get("env-a")!;
      vi.setSystemTime(Date.now() + 30);
      expect(await w.route(runnerHello(ticket))).toBeNull();
      const late = await connect(w.gateway("tenant-a"), runnerHello(ticket));
      expect(late.error).toBe("enrolment.expired");
      expect(managedTrusts(w.gateway("tenant-a"))).toHaveLength(0);
      // The expired route let go of its tenant.
      expect(w.leases.held).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("revokes the client's binding when its environment is stopped or deleted, and enrols afresh on start", async () => {
    const w = await world();
    await w.controller.create({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-create" });
    const first = await connect(w.gateway("tenant-a"), runnerHello(w.driver.tickets.get("env-a")!));
    await w.controller.stop({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-stop" });
    const stopped = await w.repository.lookupCredential(first.token!);
    expect(stopped).toMatchObject({ status: "inactive", reason: "revoked" });
    if (stopped.status === "invalid") throw new Error("Expected a proved credential");
    expect(await w.environmentAuthority(stopped.binding)).toBe(false);
    expect(first.closed.length).toBeGreaterThan(0);
    expect(await w.route({ clientId: "environment-runner", clientType: "extension", token: first.token!, metadata: { domainId: WEB } })).toBeNull();

    await w.controller.start({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-start" });
    const second = await connect(w.gateway("tenant-a"), runnerHello(w.driver.tickets.get("env-a")!));
    expect(second.token).toBeDefined();
    expect(managedTrusts(w.gateway("tenant-a"))).toHaveLength(1);
    await w.controller.delete({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-delete" });
    expect(await w.repository.lookupCredential(second.token!)).toMatchObject({ status: "inactive", reason: "revoked" });
    expect(managedTrusts(w.gateway("tenant-a"))).toHaveLength(0);
    expect(await w.store.get("env-a")).toMatchObject({ desired: "deleted", observed: "deleted" });
    // Nothing holds the tenant open once its environment is gone.
    expect(w.leases.held).toBe(0);
  });

  it("leaves the primary workspace and ordinary clients to their own authority", async () => {
    const w = await world();
    const held = { released: 0 };
    w.routes.register("fxet_primary-route", { workspaceId: PRIMARY, environmentId: "env-a", release: () => { held.released += 1; } }, Date.now() + 60_000);
    expect(await resolveEnvironmentEnrolmentRoute({ ticket: "fxet_primary-route", signal: new AbortController().signal }, { routes: w.routes, store: w.store, primaryWorkspaceId: PRIMARY, acquire: w.acquire })).toBeNull();
    expect(w.leases.acquired).toEqual([]);
    // Without an enrolment route, a ticket routes nowhere.
    expect(await resolveTrustedClientRoute({ hello: runnerHello("fxet_primary-route"), signal: new AbortController().signal }, {
      repository: w.repository, primaryWorkspaceId: PRIMARY, acquire: w.acquire, authorize: async () => true
    })).toBeNull();
    await w.controller.create({ actor: actorA, workspaceId: "tenant-a", environmentId: "env-a", operationId: "op-create" });
    const base: ClientTrustBinding = { workspaceId: "tenant-a", trustedClientId: "trust-1", approvedByUserId: FLUXIQ_MANAGED_HOST_PRINCIPAL, clientId: "runner", clientType: "extension", domainId: WEB, managedHost: { hostId: environmentHostId("env-a"), profile: "named" } };
    expect(await w.environmentAuthority(base)).toBe(true);
    expect(await w.environmentAuthority({ ...base, workspaceId: PRIMARY })).toBe(false);
    expect(await w.environmentAuthority({ ...base, workspaceId: "tenant-b" })).toBe(false);
    expect(await w.environmentAuthority({ ...base, managedHost: { hostId: "host-1", profile: "named" } })).toBe(false);
    expect(await w.environmentAuthority({ ...base, managedHost: { hostId: environmentHostId("env-a"), profile: "fresh" } })).toBe(false);
    expect(await w.environmentAuthority({ ...base, approvedByUserId: "person-a" })).toBe(false);
    const { managedHost: _managedHost, ...ordinary } = base;
    expect(await w.environmentAuthority(ordinary)).toBe(false);
  });

  it("refuses drivers that isolate nothing under the service profile", async () => {
    const w = await world();
    const composition = { admission, authorize, domainId: WEB, store: w.store, acquire: w.acquire, routes: w.routes };
    expect(() => composeEnvironmentController<Actor>({ ...composition, profile: "service", driver: new FakeEnvironmentDriver() })).toThrow("driver_refused");
    const localProcess = { kind: "local-process" as const, inspect: async () => "absent" as const, allocate: async () => undefined, start: async () => undefined, stop: async () => undefined, release: async () => undefined };
    expect(() => composeEnvironmentController<Actor>({ ...composition, profile: "service", driver: localProcess })).toThrow("driver_refused");
    expect(composeEnvironmentController<Actor>({ ...composition, profile: "local", driver: localProcess })).toBeDefined();
  });
});
