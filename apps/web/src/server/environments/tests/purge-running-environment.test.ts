// @fluxiq-test-group real-sql
// The account deletion cascade over a running dedicated browser, with the
// real workspace manager and real tenant instances: the environment's client
// is enrolled and connected at its tenant's gateway through the hosted route
// (which holds the tenant open while the socket lives), then the cascade's
// environments step and its workspace step run as deleteAccount runs them.
// The deletion must finish, or wait as DeletionPending for the sweep; any
// other failure is the 500 the provisioning listener answered live.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FluxIQ, fluxiqLayoutV3Paths, removeFluxIQWorkspaceRoot, type FluxIQOptions } from "fluxiq";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "fluxiq/client-gateway";
import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import { DeletionPending, dedicatedEnvironmentTarget, EnvironmentEnrolmentRoutes, FakeEnvironmentDriver, SQLiteEnvironmentStore } from "fluxiq/platform";
import type { CommerceAdmissionDecision, CommerceAdmissionRequest, CommerceExecutionAuthority } from "fluxiq/platform";
import { afterEach, describe, expect, it } from "vitest";
import { createTenantFluxIQ, FluxIQWorkspaceManager } from "../../../lib/workspaces";
import { composeCascadePorts, purgeEnvironments } from "../../provisioning-listener/cascade";
import { composeEnvironmentController } from "../compose-controller";
import { resolveEnvironmentEnrolmentRoute } from "../resolve-enrolment-route";

const DOMAIN = "web-automation";
const TENANT = "tenant-a";
const ACCOUNT = "account-a";
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function authorize(request: CommerceAdmissionRequest<string>): Promise<CommerceExecutionAuthority | null> {
  if (request.workspaceId !== TENANT) return null;
  const owner = { environmentId: request.targetId, accountId: ACCOUNT, workspaceId: TENANT };
  return { principalId: "person-a", accountId: ACCOUNT, workspaceId: TENANT, target: dedicatedEnvironmentTarget(owner, "local"), cloudAuthorization: { accountId: ACCOUNT, workspaceId: TENANT } };
}

const admission = {
  admit: async (request: CommerceAdmissionRequest<string>): Promise<CommerceAdmissionDecision> => ({
    allowed: true, source: "commerce", allocation: "dedicated", principalId: "person-a", accountId: ACCOUNT, workspaceId: request.workspaceId, targetId: request.targetId,
    capability: request.capability, policyId: "policy-1", entitlementKey: "cloud.dedicated", providerId: "fake", subscriptionId: "sub-a", subscriptionVersion: 1, validUntilMs: Number.MAX_SAFE_INTEGER
  })
};

async function world() {
  const dataRoot = mkdtempSync(path.join(os.tmpdir(), "fluxiq-purge-running-"));
  roots.push(dataRoot);
  const primary = FluxIQ.create({ rootDir: dataRoot, loadEnv: false, modelProvidersEnabled: false });
  const instantiate = (options: FluxIQOptions) => FluxIQ.create({ ...options, modelProvidersEnabled: false });
  const manager = new FluxIQWorkspaceManager({
    tenancy: "multi",
    primaryWorkspaceId: "workspace-main",
    createPrimary: () => primary,
    createTenant: async ({ workspaceId, heldKeys, primary: owner }) => await createTenantFluxIQ({ workspaceId, heldKeys, dataRoot: owner.paths.root, instantiate }),
    removeTenantRoot: async ({ workspaceId, primary: owner }) => {
      await removeFluxIQWorkspaceRoot(fluxiqLayoutV3Paths(owner.paths.root), workspaceId);
    },
    sweepIntervalMs: 0,
    warn: () => undefined
  });
  closers.push(() => manager.close());
  const store = new SQLiteEnvironmentStore({ rootDir: path.join(dataRoot, "environments") });
  const routes = new EnvironmentEnrolmentRoutes();
  const driver = new FakeEnvironmentDriver();
  const acquire = (workspaceId: string) => manager.acquire(workspaceId);
  const controller = composeEnvironmentController<string>({ profile: "local", admission, authorize, driver, domainId: DOMAIN, store, acquire, routes });
  const ports = composeCascadePorts({
    primary,
    manager: () => manager,
    current: () => true,
    store: async () => ({ getWorkspace: async (workspaceId: string) => ({ workspaceId, kind: "personal" as const, ownerUserId: ACCOUNT, createdAtMs: 0 }) }),
    listActiveForUser: async () => [],
    billing: async () => null,
    purgeEnvironments: purgeEnvironments({ controller: async () => controller, records: async () => store })
  });
  /** The runner presents its ticket through the hosted route, which holds the tenant open until the socket closes, as the transport does. */
  const connectRunner = async (ticket: string) => {
    const hello: ClientGatewayClientHello = { clientId: "environment-runner", clientType: "extension", name: "Environment runner", enrolmentTicket: ticket, metadata: { domainId: DOMAIN } };
    const route = await resolveEnvironmentEnrolmentRoute({ ticket, signal: new AbortController().signal }, { routes, store, primaryWorkspaceId: "workspace-main", acquire });
    if (route === null) throw new Error("The ticket routed nowhere.");
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const socket = { closed: false };
    const session = route.gateway.connect({
      socket: {
        send: (raw: string) => { sent.push(JSON.parse(raw)); },
        close: () => {
          if (socket.closed) return;
          socket.closed = true;
          route.release();
        }
      }
    });
    await route.gateway.receive(session.sessionId, { id: "hello-1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: hello });
    return { sent, socket };
  };
  return { manager, store, driver, controller, ports, connectRunner };
}

/** What a cascade step came to: done, waiting for the sweep, or the failure the listener would answer as a 500. */
async function outcome(step: Promise<void>): Promise<string> {
  try {
    await step;
    return "done";
  } catch (error) {
    if (error instanceof DeletionPending) return `pending:${error.reason}`;
    throw error;
  }
}

describe("deleting an account whose dedicated browser runs and is connected", () => {
  it("purges the browser and deletes the workspace, or leaves it for the sweep, and never fails otherwise", async () => {
    delete process.env.FLUXIQ_PROFILE;
    const w = await world();
    await w.controller.create({ actor: "person-a", workspaceId: TENANT, environmentId: "env-a", operationId: "op-create" });
    const runner = await w.connectRunner(w.driver.tickets.get("env-a")!);
    expect(runner.sent.find((message) => message.type === "server.session_ready")).toBeDefined();

    const purge = await outcome(w.ports.purgeEnvironments({ accountId: ACCOUNT, workspaceIds: [TENANT], operationId: "receipt-1" }));
    expect(purge).toBe("done");
    expect(await w.store.get("env-a")).toBeNull();
    expect(w.driver.observation("env-a")).toBe("absent");
    // The purge revoked the client: its socket was closed, which lets go of the tenant.
    expect(runner.socket.closed).toBe(true);

    expect(await outcome(w.ports.deleteWorkspaceData(TENANT))).toBe("done");
  });
});
