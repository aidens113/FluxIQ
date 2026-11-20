import type { FluxIQ } from "fluxiq";
import { HeldKeys } from "fluxiq/secret-keys";
import { describe, expect, it, vi } from "vitest";
import { FluxIQWorkspaceManager } from "../workspace-manager";

// Dropping one person's custody in one tenant: a suspended or removed
// membership, or a deleted account, takes their unlocks there and nothing
// else. Stand-in instances and synthetic key buffers only.

function instance(label: string): FluxIQ {
  return { paths: { root: `/data/${label}` }, programs: {}, close: vi.fn(async () => undefined) } as unknown as FluxIQ;
}

function unlock(heldKeys: HeldKeys, sessionId: string, userId: string): Buffer {
  const decryptionKey = Buffer.alloc(32, 7);
  heldKeys.holdSession({ sessionId, userId, expiresAtMs: Number.MAX_SAFE_INTEGER, decryptionKeys: new Map([["key-1", { keyUpdatedAtMs: 1, decryptionKey }]]), expiryTimer: heldKeys.sessionExpiryTimer(sessionId, 60_000) });
  return decryptionKey;
}

describe("FluxIQWorkspaceManager.dropUserCustody", () => {
  it("drops one person's unlocks in one tenant and leaves theirs elsewhere and other people's", async () => {
    const custody = new Map<string, HeldKeys>();
    const manager = new FluxIQWorkspaceManager({
      tenancy: "multi",
      primaryWorkspaceId: "workspace-main",
      createPrimary: () => instance("primary"),
      createTenant: async ({ workspaceId, heldKeys }) => {
        custody.set(workspaceId, heldKeys);
        return instance(workspaceId);
      },
      isBusy: () => false,
      sweepIntervalMs: 0
    });
    for (const workspaceId of ["tenant-a", "tenant-b"]) (await manager.acquire(workspaceId)).release();
    const a = custody.get("tenant-a")!;
    const b = custody.get("tenant-b")!;
    const personInA = unlock(a, "session-person-a", "person");
    unlock(b, "session-person-b", "person");
    unlock(a, "session-other-a", "other");
    let woken = false;
    const waiter = vi.spyOn(a, "notifyChanged").mockImplementation(() => { woken = true; });

    expect(manager.dropUserCustody("tenant-a", "person")).toBe(1);
    expect(a.session("session-person-a")).toBeUndefined();
    expect(personInA.every((byte) => byte === 0)).toBe(true);
    expect(a.session("session-other-a")).toBeDefined();
    expect(b.session("session-person-b")).toBeDefined();
    expect(woken).toBe(true);
    waiter.mockRestore();

    expect(manager.dropUserCustody("tenant-a", "person")).toBe(0);
    expect(manager.dropUserCustody("tenant-never-opened", "person")).toBe(0);
    await manager.close();
  });
});
