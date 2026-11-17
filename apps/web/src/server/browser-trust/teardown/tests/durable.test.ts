import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FluxIQ } from "fluxiq";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "fluxiq/client-gateway";
import { createSqliteClientTrustRepository } from "fluxiq/platform";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FluxIQWorkspaceManager } from "../../../../lib/workspaces";
import { forgetClientCredential } from "../index";

const ports = vi.hoisted(() => ({ repository: vi.fn(), hold: vi.fn(), platform: vi.fn() }));
vi.mock("../../index", () => ({ getBrowserTrustRepository: ports.repository }));
vi.mock("../../../provisioning-listener", () => ({ platformReadStoreFor: ports.platform }));
vi.mock("../runtime", () => ({ holdCredentialTeardownRuntime: ports.hold }));
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.resetAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-durable-teardown-"));
  cleanup.push(async () => { await rm(root, { recursive: true, force: true }); });
  const repository = createSqliteClientTrustRepository({ filePath: path.join(root, "browser-trust.sqlite") });
  cleanup.push(() => repository.close());
  const durable = repository.scopedStore("tenant-one");
  const writing = { beforeSave: undefined as (() => Promise<void>) | undefined };
  const transport = { failDisconnect: false };
  const gateway = new ClientGatewayService({ trustedClientStore: {
    load: () => durable.load(),
    save: async clients => {
      await writing.beforeSave?.();
      await durable.save(clients);
    }
  } });
  const primary = { paths: { fluxiq: root }, close: async () => undefined } as unknown as FluxIQ;
  const tenant = { programs: { clientGateway: gateway }, close: async () => undefined } as unknown as FluxIQ;
  const createTenant = vi.fn(async () => { throw new Error("Creating a tenant is forbidden in this fixture."); });
  const manager = new FluxIQWorkspaceManager({
    tenancy: "multi", primaryWorkspaceId: "workspace-main", createPrimary: () => primary,
    createTenant, openExistingTenant: async () => tenant, isBusy: () => false, sweepIntervalMs: 0, warn: vi.fn()
  });
  cleanup.push(() => manager.close());
  ports.repository.mockReturnValue(repository);
  ports.platform.mockResolvedValue({ getWorkspace: async () => ({ workspaceId: "tenant-one" }) });
  ports.hold.mockImplementation(async () => {
    const held = await manager.acquire("workspace-main");
    return { primary, manager, current: () => true, release: () => held.release() };
  });
  async function pair(clientId: string, offline = true) {
    const session = gateway.connect({ socket: {
      send: async (raw: string) => {
        const message = JSON.parse(raw) as { type: string };
        if (message.type === "server.disconnect" && transport.failDisconnect) throw new Error("private socket failure");
      }
    } });
    await gateway.receive(session.sessionId, {
      type: "client.hello", id: `hello.${clientId}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(),
      payload: { clientId, clientType: "extension", name: "Test browser", metadata: { domainId: "web" } }
    });
    const reference = gateway.snapshot().pairings.find(pairing => pairing.requestedBySessionId === session.sessionId)?.pairingCode;
    if (!reference) throw new Error("Fixture client did not request approval.");
    await gateway.approvePairing(reference, { approvedByUserId: "disabled-person" });
    const ready = gateway.outbound(session.sessionId).filter(message => message.type === "server.session_ready").at(-1);
    if (!ready || ready.type !== "server.session_ready" || typeof ready.payload.token !== "string") throw new Error("Fixture credential was not issued.");
    if (offline) gateway.disconnect(session.sessionId, "Fixture browser is offline.");
    return ready.payload.token;
  }
  return { repository, gateway, manager, createTenant, writing, transport, pair };
}

describe("teardown through the real gateway and SQLite trust owner", () => {
  it("durably revokes only the proved offline client's trust and repeats without opening content authority", async () => {
    const f = await fixture();
    const own = await f.pair("extension-one");
    const foreign = await f.pair("extension-other");
    expect(await forgetClientCredential(own)).toBe(true);
    expect((await f.repository.lookupCredential(own)).status).toBe("inactive");
    expect((await f.repository.lookupCredential(foreign)).status).toBe("current");
    expect(await forgetClientCredential(own)).toBe(false);
    expect(f.createTenant).not.toHaveBeenCalled();
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
    expect(f.manager.get("workspace-main")?.leases).toBe(0);
  });

  it("rolls back a refused durable save, releases both leases and permits truthful retry", async () => {
    const f = await fixture();
    const own = await f.pair("extension-one");
    f.writing.beforeSave = async () => { throw new Error("private persistence failure"); };
    await expect(forgetClientCredential(own)).rejects.toThrow("Client trust could not be removed");
    expect((await f.repository.lookupCredential(own)).status).toBe("current");
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
    expect(f.manager.get("workspace-main")?.leases).toBe(0);
    f.writing.beforeSave = undefined;
    expect(await forgetClientCredential(own)).toBe(true);
    expect((await f.repository.lookupCredential(own)).status).toBe("inactive");
  });

  it("retries required session cleanup using proved revoked trust after a post-save send failure", async () => {
    const f = await fixture();
    const own = await f.pair("extension-one", false);
    const foreign = await f.pair("extension-other", false);
    const revoke = vi.spyOn(f.gateway, "revokeTrustedClient");
    f.transport.failDisconnect = true;
    await expect(forgetClientCredential(own)).rejects.toThrow("Client trust could not be removed");
    const proof = await f.repository.lookupCredential(own);
    expect(proof.status).toBe("inactive");
    expect("reason" in proof ? proof.reason : null).toBe("revoked");
    f.transport.failDisconnect = false;
    expect(await forgetClientCredential(own)).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(f.gateway.snapshot().sessions.find(session => session.clientId === "extension-one")?.status).not.toBe("ready");
    expect(f.gateway.snapshot().sessions.find(session => session.clientId === "extension-other")?.status).toBe("ready");
    expect((await f.repository.lookupCredential(foreign)).status).toBe("current");
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
    expect(f.manager.get("workspace-main")?.leases).toBe(0);
  });

  it.each([false, true])("queues cleanup behind tentative revocation and handles a subsequent save failure (%s)", async failAgain => {
    const f = await fixture();
    const own = await f.pair("extension-one");
    const saving = deferred<void>();
    const entered = deferred<void>();
    let saves = 0;
    f.writing.beforeSave = async () => {
      saves += 1;
      if (saves === 1) {
        entered.resolve();
        await saving.promise;
      } else if (failAgain) {
        throw new Error("private second persistence failure");
      }
    };
    type Outcome = { ok: true; value: boolean } | { ok: false; message: string };
    const outcome = (pending: Promise<boolean>): Promise<Outcome> => pending.then(
      value => ({ ok: true, value }),
      error => ({ ok: false, message: error instanceof Error ? error.message : "Unexpected error type" })
    );
    const secondEntered = deferred<void>();
    const revoke = f.gateway.revokeTrustedClient.bind(f.gateway);
    let calls = 0;
    vi.spyOn(f.gateway, "revokeTrustedClient").mockImplementation((...args) => {
      const pending = revoke(...args);
      calls += 1;
      if (calls === 2) secondEntered.resolve();
      return pending;
    });
    const first = outcome(forgetClientCredential(own));
    await entered.promise;
    let secondSettled = false;
    const second = outcome(forgetClientCredential(own)).then(result => {
      secondSettled = true;
      return result;
    });
    let firstOutcome!: Outcome;
    let secondOutcome!: Outcome;
    try {
      await Promise.race([secondEntered.promise, second]);
      expect((await f.repository.lookupCredential(own)).status).toBe("current");
      expect(secondSettled).toBe(false);
    } finally {
      // Both outcomes are inspected below; always drain accepted writes even if the pending assertion fails.
      saving.reject(new Error("private persistence failure"));
      [firstOutcome, secondOutcome] = await Promise.all([first, second]);
    }
    expect(firstOutcome).toEqual({ ok: false, message: "Client trust could not be removed. Please try again." });
    expect(secondOutcome).toEqual(failAgain
      ? { ok: false, message: "Client trust could not be removed. Please try again." }
      : { ok: true, value: true });
    expect((await f.repository.lookupCredential(own)).status).toBe(failAgain ? "current" : "inactive");
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
    expect(f.manager.get("workspace-main")?.leases).toBe(0);
  });
});
