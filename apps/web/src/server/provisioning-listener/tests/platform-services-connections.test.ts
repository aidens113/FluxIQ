// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IdentityAccessService } from "fluxiq/identity-access";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRecordRepository } from "./memory-record-repository";

// One hosted account's provisioning opens each platform database once, not once
// per read and write. The composition is the real one over real SQLite files;
// only the FluxIQ instance and the workspace manager are stand-ins. Opens and
// closes are counted at the pool's connector, which every platform repository
// operation goes through.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };

const runtime = vi.hoisted(() => ({
  root: "",
  fluxiq: null as unknown as { paths: Record<string, string>; programs: Record<string, unknown> },
  manager: { tenancy: "multi", primaryWorkspaceId: "workspace-main", dropUserCustody: () => 0 },
  opened: [] as string[],
  closed: 0,
  pools: [] as Array<{ closeAll(): Promise<void> }>
}));

vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: async () => runtime.fluxiq,
  getFluxIQWorkspaces: () => runtime.manager,
  isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.fluxiq
}));
vi.mock("../../../lib/workspaces", () => ({ primaryWorkspaceId: () => "workspace-main" }));
vi.mock("../../key-sessions", () => ({ closeKeySessionServices: async () => undefined }));
vi.mock("../../connect", () => ({ closeConnectServices: async () => undefined }));
vi.mock("../../browser-trust", () => ({ closeBrowserTrustRepository: async () => undefined, getBrowserTrustRepository: () => ({ listActiveForUser: async () => [] }) }));
vi.mock("../../commerce", () => ({ getCommerceBilling: async () => null }));
vi.mock("fluxiq/database-manager", async (importOriginal) => {
  const original = await importOriginal<typeof import("fluxiq/database-manager")>();
  class CountingPool extends original.SQLiteConnectionPool {
    constructor() {
      super();
      runtime.pools.push(this);
      const use = this.use.bind(this);
      this.use = (filePath, connector, operation) => use(filePath, {
        ...connector,
        open: async () => {
          runtime.opened.push(path.relative(runtime.root, filePath));
          return await connector.open();
        },
        close: async (db) => {
          runtime.closed += 1;
          await connector.close(db);
        }
      }, operation);
    }
  }
  return { ...original, SQLiteConnectionPool: CountingPool };
});
vi.mock("fluxiq/platform", async (importOriginal) => {
  const original = await importOriginal<typeof import("fluxiq/platform")>();
  return {
    ...original,
    // The platform's own audit store and the identity service are not under test.
    createPlatformServices: (options: Parameters<typeof original.createPlatformServices>[0]) =>
      original.createPlatformServices({ ...options, identity: new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF }), email: new original.MemoryEmailSender() })
  };
});

import { closePlatformServices, getPlatformServices } from "../platform-services";

type Primary = Parameters<typeof closePlatformServices>[0];

beforeEach(async () => {
  runtime.root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-platform-connections-"));
  runtime.fluxiq = { paths: { fluxiq: runtime.root, config: path.join(runtime.root, "config.json"), databases: path.join(runtime.root, "databases"), root: runtime.root }, programs: { identityAccess: {}, clientGateway: {} } };
  runtime.opened = [];
  runtime.closed = 0;
  runtime.pools = [];
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.example.test");
  vi.stubEnv("FLUXIQ_EMAIL_SENDER", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(runtime.root, { recursive: true, force: true });
});

const caller = (services: Awaited<ReturnType<typeof getPlatformServices>>) => services.provisionerCaller("10.1.2.3");
const input = (n: number) => ({ requestId: `req-${n}`, email: `person${n}@example.test`, displayName: "A Person", policies: ["FluxIQUserAccess"], workspace: "new" });

describe("platform provisioning connections", () => {
  it("opens each database once for a whole createAccount, and closes every handle when the run ends", async () => {
    const services = await getPlatformServices();
    const before = runtime.opened.length;
    const created = await services.provisioning.run("createAccount", input(1), caller(services));
    expect(created.ok).toBe(true);
    const opened = runtime.opened.slice(before);
    // The platform database, and the new workspace's IAM database.
    expect(opened.length).toBeLessThanOrEqual(3);
    expect(new Set(opened).size).toBe(opened.length);
    expect(runtime.closed).toBe(runtime.opened.length);
    await closePlatformServices(runtime.fluxiq as unknown as Primary);
  });

  it("opens no more for a second account, and one run's handles are closed before the next begins", async () => {
    const services = await getPlatformServices();
    await services.provisioning.run("createAccount", input(1), caller(services));
    const afterFirst = runtime.opened.length;
    const second = await services.provisioning.run("createAccount", input(2), caller(services));
    expect(second.ok).toBe(true);
    expect(runtime.opened.length - afterFirst).toBeLessThanOrEqual(3);
    expect(runtime.closed).toBe(runtime.opened.length);
    await closePlatformServices(runtime.fluxiq as unknown as Primary);
  });

  it("keeps the connection through the provisioning queue when runs overlap", async () => {
    const services = await getPlatformServices();
    const before = runtime.opened.length;
    const results = await Promise.all([1, 2, 3].map((n) => services.provisioning.run("createAccount", input(n), caller(services))));
    expect(results.every((result) => result.ok)).toBe(true);
    // Three queued runs: at most the platform file and one workspace file each, never one open per read or write.
    expect(runtime.opened.length - before).toBeLessThanOrEqual(3 * 3);
    expect(runtime.closed).toBe(runtime.opened.length);
    await closePlatformServices(runtime.fluxiq as unknown as Primary);
  });

  it("closes every handle on shutdown", async () => {
    const services = await getPlatformServices();
    await services.provisioning.run("createAccount", input(1), caller(services));
    await closePlatformServices(runtime.fluxiq as unknown as Primary);
    expect(runtime.closed).toBe(runtime.opened.length);
    // No handle is left on a file, so the directory can go at once (checked by afterEach's removal on Windows).
    await rm(path.join(runtime.root, "databases"), { recursive: true, force: true });
  });
});
