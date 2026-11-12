import { describe, expect, it, vi } from "vitest";
import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { FluxIQHostLaunchRequest } from "../host-launch-request.ts";
import { startManagedHosts } from "../start-managed-hosts.ts";

function fixture() {
  const sessions: ClientGatewaySession[] = [];
  const events = new Set<() => void>();
  const revoked: string[] = [];
  const gateway = { snapshot: () => ({ sessions }), onEvent: (handler: () => void) => {
    events.add(handler);
    return () => events.delete(handler);
  }, managedHosts: {
    revokeStaleManagedHosts: vi.fn(async () => 0), revokeManagedHost: vi.fn(async (id: string) => {
      revoked.push(id);
      return 1;
    }),
    issueHostEnrolment: vi.fn(() => ({ ticket: "one-time-fixture-ticket", expiresAt: 1 }))
  } } as unknown as ClientGatewayService;
  const launched: Array<{ request: FluxIQHostLaunchRequest; close: ReturnType<typeof vi.fn>; crash(): void }> = [];
  const launcher = { launch: vi.fn(async (request: FluxIQHostLaunchRequest) => {
    request.signal.throwIfAborted();
    request.takeEnrolmentTicket();
    let crash = (): void => undefined;
    const closed = new Promise<void>((resolve) => { crash = resolve; });
    const close = vi.fn(async () => { crash(); });
    launched.push({ request, close, crash });
    sessions.push({ sessionId: `session-${launched.length}`, clientId: `client-${launched.length}`, managedHostId: request.hostId, clientType: "extension", name: "test", status: "ready", connectedAt: 1, lastSeenAt: 1, capabilities: [] });
    for (const notify of events) notify();
    return { hostId: request.hostId, close, closed };
  }) };
  const options = { gateway, launcher, count: 2, domainId: "web", gatewayUrl: "ws://127.0.0.1/client", coreApiUrl: "http://127.0.0.1", dataDir: "test-owned-data", profile: { kind: "fresh" as const }, headless: false };
  return { gateway, launcher, launched, revoked, options, events };
}

describe("managed host orchestration", () => {
  it("awaits both enrolments, closes every host and revokes fresh trust exactly once", async () => {
    const f = fixture();
    const hosts = await startManagedHosts(f.options);
    expect(f.launched).toHaveLength(2);
    expect(f.gateway.managedHosts.issueHostEnrolment).toHaveBeenCalledTimes(2);
    await Promise.all([hosts.close(), hosts.close()]);
    expect(f.revoked.sort()).toEqual(["host-1", "host-2"]);
    expect(f.launched.every((host) => host.close.mock.calls.length === 1)).toBe(true);
    expect(f.events.size).toBe(0);
  });

  it("closes the other host after a partial startup failure", async () => {
    const f = fixture();
    f.launcher.launch.mockImplementationOnce(async () => { throw new Error("fixture launch failure"); });
    await expect(startManagedHosts(f.options)).rejects.toThrow("fixture launch failure");
    expect(f.launched.every((host) => host.close.mock.calls.length === 1)).toBe(true);
    expect(f.events.size).toBe(0);
  });

  it("reports a named host closing without deleting its trust or starting another browser", async () => {
    const f = fixture();
    const print = vi.fn();
    const hosts = await startManagedHosts({ ...f.options, count: 1, profile: { kind: "named", name: "work" }, print });
    f.launched[0]!.crash();
    await vi.waitFor(() => expect(print).toHaveBeenCalledWith(expect.stringContaining("named profile is preserved")));
    expect(f.launcher.launch).toHaveBeenCalledTimes(1);
    await hosts.close();
    expect(f.revoked).toEqual([]);
  });

  it("restores a fresh host with a new ticket and awaits its new session", async () => {
    const f = fixture();
    const hosts = await startManagedHosts({ ...f.options, count: 1 });
    f.launched[0]!.crash();
    await vi.waitFor(() => expect(f.launcher.launch).toHaveBeenCalledTimes(2));
    expect(f.gateway.managedHosts.issueHostEnrolment).toHaveBeenCalledTimes(2);
    await hosts.close();
    expect(f.revoked).toEqual(["host-1", "host-1"]);
  });

  it("drains owned hosts before reporting a failed fresh-host recovery", async () => {
    const f = fixture();
    const failed = vi.fn();
    const hosts = await startManagedHosts({ ...f.options, count: 1, onFailure: failed });
    f.launcher.launch.mockImplementationOnce(async () => { throw new Error("fixture recovery failure"); });
    f.launched[0]!.crash();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect(f.launched[0]!.request.signal.aborted).toBe(true);
    expect(f.events.size).toBe(0);
    await hosts.close();
  });
});
