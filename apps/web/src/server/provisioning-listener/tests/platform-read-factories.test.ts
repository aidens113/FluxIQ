import path from "node:path";
import type { FluxIQ } from "fluxiq";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: undefined as unknown, afterReload: vi.fn(), create: vi.fn(), open: vi.fn(), flush: vi.fn(), sequence: 0 }));

vi.mock("node:fs", async importOriginal => ({ ...await importOriginal<typeof import("node:fs")>(), mkdirSync: vi.fn() }));
vi.mock("fluxiq/database-manager", async (importOriginal) => ({ ...(await importOriginal<typeof import("fluxiq/database-manager")>()), SQLiteRepository: class {} }));
vi.mock("fluxiq/platform", async importOriginal => ({
  ...await importOriginal<typeof import("fluxiq/platform")>(),
  createPlatformServices: state.create,
  IamAuditStore: { open: state.open },
  BufferedIamAuditSink: class { flush = state.flush; close = vi.fn(); }
}));
vi.mock("../../../lib/fluxiq", () => ({ getFluxIQAfterReload: state.afterReload, getFluxIQWorkspaces: () => ({ tenancy: "multi" }) }));
vi.mock("../../key-sessions", () => ({ closeKeySessionServices: vi.fn() }));
vi.mock("../../browser-trust", () => ({ closeBrowserTrustRepository: vi.fn() }));
vi.mock("../../connect", () => ({ closeConnectServices: vi.fn() }));
vi.mock("../resolve-email-sender", () => ({ resolveEmailSender: vi.fn() }));

import { getPlatformIamAuditSink, getPlatformServices, platformIamAuditReaderFor, platformReadStoreFor, readPlatformIamAudit } from "../platform-services";

function primary(label: string): FluxIQ {
  const root = path.resolve("synthetic-platform-read", `${state.sequence}-${label}`);
  return { paths: { fluxiq: root, databases: path.join(root, "databases"), config: path.join(root, "config.json") }, programs: { identityAccess: { label } } } as unknown as FluxIQ;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.sequence += 1;
  state.afterReload.mockImplementation(async () => state.current);
  state.flush.mockResolvedValue(undefined);
  state.open.mockImplementation(async (file: string) => ({ read: vi.fn(async () => [{ requestId: file }]), close: vi.fn() }));
  state.create.mockImplementation(async ({ identity }: { identity: unknown }) => ({
    store: {
      getAccount: vi.fn(async (userId: string) => ({ userId, identity })),
      getMembership: vi.fn(), getWorkspace: vi.fn(), listMembershipsOfWorkspace: vi.fn()
    },
    provisioning: { private: "not a read capability" }
  }));
});

describe("pinned platform read factories", () => {
  it("reuses the existing exact-primary composition and exposes read methods only", async () => {
    const held = primary("a");
    state.current = held;
    const read = await platformReadStoreFor(held);
    expect(Object.keys(read).sort()).toEqual(["getAccount", "getMembership", "getWorkspace", "listMembershipsOfWorkspace"]);
    expect(Object.isFrozen(read)).toBe(true);
    expect(state.afterReload).not.toHaveBeenCalled();
    const existing = await getPlatformServices();
    expect(state.create).toHaveBeenCalledOnce();
    expect(state.create.mock.calls[0]?.[0].identity).toBe(held.programs.identityAccess);
    await read.getAccount("member-a");
    expect(existing.store.getAccount).toHaveBeenCalledWith("member-a");
  });

  it("keeps separate primary identity bindings even when runtime selection changes", async () => {
    const held = primary("a");
    const replacement = primary("b");
    state.current = replacement;
    const pinned = await platformReadStoreFor(held);
    expect(state.afterReload).not.toHaveBeenCalled();
    const current = await getPlatformServices();
    expect(state.create).toHaveBeenCalledTimes(2);
    expect(state.create.mock.calls.map(([input]) => input.identity)).toEqual([held.programs.identityAccess, replacement.programs.identityAccess]);
    await pinned.getAccount("member-a");
    expect(current.store.getAccount).not.toHaveBeenCalled();
  });

  it("shares the root audit store/sink with existing readers without resolving a new primary per batch", async () => {
    const held = primary("a");
    state.current = held;
    const pinned = await platformIamAuditReaderFor(held);
    expect(state.afterReload).not.toHaveBeenCalled();
    await getPlatformIamAuditSink();
    await readPlatformIamAudit({ limit: 3 });
    const callsBefore = state.afterReload.mock.calls.length;
    const replacement = primary("b");
    state.current = replacement;
    const records = await pinned.read({ limit: 2 });
    expect(records).toEqual([{ requestId: path.join(held.paths.fluxiq, "platform", "iam-audit.sqlite") }]);
    expect(state.open).toHaveBeenCalledOnce();
    expect(state.afterReload).toHaveBeenCalledTimes(callsBefore);
    expect(state.flush).toHaveBeenCalledTimes(2);
  });

  it("preserves the shared sink's best-effort flush behavior for pinned audit reads", async () => {
    const held = primary("a");
    const pinned = await platformIamAuditReaderFor(held);
    state.flush.mockRejectedValueOnce(new Error("synthetic flush failure retained by the sink"));
    expect(await pinned.read({ limit: 1 })).toEqual([{ requestId: path.join(held.paths.fluxiq, "platform", "iam-audit.sqlite") }]);
    expect(state.afterReload).not.toHaveBeenCalled();
  });
});
