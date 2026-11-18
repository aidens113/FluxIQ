import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { TrustedModuleBuildIdentity } from "../../../runtime/build-identity/modules/index.ts";
import type { ClientGatewayRouteLease } from "../routing/index.ts";
import { deferred, ROUTED_ORIGIN, withRoutedServer } from "./routed-server.ts";

const ids = vi.hoisted(() => ({ collide: false }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => ids.collide ? "00000000-0000-4000-8000-000000000001" : actual.randomUUID() };
});
afterEach(() => { ids.collide = false; });

const IDENTITY: TrustedModuleBuildIdentity = {
  schema: 1,
  protocol: "fluxiq.module-build-identity.v1",
  moduleId: "fluxiq/web-client-gateway-server",
  version: "0.1.0",
  normalization: "module-payload-v1",
  artifactDigest: "a".repeat(64),
  sourceInputsDigest: "b".repeat(64)
};

describe("authorized first-hello gateway routing", () => {
  it("isolates two gateways even with colliding session and client ids and never connects primary", async () => {
    ids.collide = true;
    const first = new ClientGatewayService();
    const second = new ClientGatewayService();
    const releaseFirst = vi.fn();
    const releaseSecond = vi.fn();
    await withRoutedServer(async ({ hello, origin, peer }) => {
      expect(origin).toBe(ROUTED_ORIGIN);
      expect(peer.prefix).toBe("127.0.0.0/24");
      return hello.token === "fixture-authority-first"
        ? { gateway: first, release: releaseFirst }
        : { gateway: second, release: releaseSecond };
    }, async ({ open, primary }) => {
      const primaryConnect = vi.spyOn(primary, "connect");
      const one = await open();
      const two = await open();
      one.sendJson("client.hello", { clientType: "extension", clientId: "same-client", token: "fixture-authority-first", metadata: { workspaceId: "spoof-other" } });
      two.sendJson("client.hello", { clientType: "extension", clientId: "same-client", token: "fixture-authority-second", metadata: { workspaceId: "spoof-first" } });
      await one.nextMessage("server.pairing_required");
      await two.nextMessage("server.pairing_required");
      expect(primaryConnect).not.toHaveBeenCalled();
      expect(primary.snapshot().sessions).toHaveLength(0);
      expect(first.snapshot().sessions[0]?.sessionId).toBe(second.snapshot().sessions[0]?.sessionId);
      expect(first.snapshot().sessions[0]?.clientId).toBe("same-client");
      one.destroy();
      await one.closed;
      await vi.waitFor(() => expect(releaseFirst).toHaveBeenCalledTimes(1));
      expect(releaseSecond).not.toHaveBeenCalled();
      expect(second.snapshot().sessions[0]?.status).toBe("pairing_required");
    });
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(releaseSecond).toHaveBeenCalledTimes(1);
  });

  it.each(["refuse", "throw"])("%s never connects a gateway or discloses resolver errors/credentials", async (verdict) => {
    const resolver = vi.fn(async () => {
      if (verdict === "throw") throw new Error("fixture-private-credential");
      return null;
    });
    await withRoutedServer(resolver, async ({ open, primary }) => {
      const connect = vi.spyOn(primary, "connect");
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension", token: "fixture-private-credential" });
      expect((await client.closed).code).toBe(1008);
      expect(connect).not.toHaveBeenCalled();
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(client.messages)).not.toContain("fixture-private-credential");
      expect(JSON.stringify(primary.snapshot().auditLog)).not.toContain("fixture-private-credential");
      expect(client.messages.at(-1)?.payload.code).toBe("gateway.route_refused");
    });
  });

  it("serializes queued input after authorization and through gateway awaits", async () => {
    const gateway = new ClientGatewayService();
    const route = deferred<ClientGatewayRouteLease | null>();
    const blockedHello = deferred<void>();
    const delivered: string[] = [];
    const original = gateway.receiveRaw.bind(gateway);
    vi.spyOn(gateway, "receiveRaw").mockImplementation(async (sessionId, text) => {
      const message = JSON.parse(text) as { type: string };
      delivered.push(message.type);
      if (message.type === "client.hello") await blockedHello.promise;
      await original(sessionId, text);
    });
    await withRoutedServer(async () => route.promise, async ({ open, primary }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      client.sendJson("client.state_update", { state: { fixture: true } });
      expect(primary.snapshot().sessions).toHaveLength(0);
      expect(delivered).toEqual([]);
      route.resolve({ gateway, release: vi.fn() });
      await vi.waitFor(() => expect(delivered).toEqual(["client.hello"]));
      blockedHello.resolve();
      await vi.waitFor(() => expect(delivered).toEqual(["client.hello", "client.state_update"]));
    });
  });

  it("aborts a pending route on close and releases a late lease without connecting", async () => {
    const gateway = new ClientGatewayService();
    const route = deferred<ClientGatewayRouteLease | null>();
    const release = vi.fn();
    const connect = vi.spyOn(gateway, "connect");
    let signal: AbortSignal | undefined;
    await withRoutedServer(async (input) => {
      signal = input.signal;
      return route.promise;
    }, async ({ open, handle }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      await vi.waitFor(() => expect(signal).toBeDefined());
      await handle.close();
      expect(signal?.aborted).toBe(true);
      expect(handle.openConnectionCount()).toBe(0);
      route.resolve({ gateway, release });
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      expect(connect).not.toHaveBeenCalled();
    });
  });

  it("retains a shared gateway build binding when its newest socket closes", async () => {
    const gateway = new ClientGatewayService();
    const bind = vi.spyOn(gateway, "bindTransportBuildIdentity");
    const release = vi.fn();
    await withRoutedServer(async () => ({ gateway, release }), async ({ open }) => {
      const first = await open();
      first.sendJson("client.hello", { clientType: "extension" });
      await first.nextMessage("server.pairing_required");
      const second = await open();
      second.sendJson("client.hello", { clientType: "extension" });
      await second.nextMessage("server.pairing_required");
      expect(bind).toHaveBeenCalledTimes(1);
      second.destroy();
      await second.closed;
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      expect(gateway.readTransportBuildIdentity()?.artifactDigest).toBe(IDENTITY.artifactDigest);
      first.destroy();
      await first.closed;
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(2));
      expect(gateway.readTransportBuildIdentity()).toBeNull();
    }, { buildIdentity: IDENTITY });
  });

  it("waits for acquired async release and holds a lease through in-flight delivery on shutdown", async () => {
    const gateway = new ClientGatewayService();
    const delivery = deferred<void>();
    const cleanup = deferred<void>();
    const release = vi.fn(() => cleanup.promise);
    vi.spyOn(gateway, "receiveRaw").mockImplementation(() => delivery.promise);
    await withRoutedServer(async () => ({ gateway, release }), async ({ open, handle }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      await vi.waitFor(() => expect(gateway.receiveRaw).toHaveBeenCalledTimes(1));
      const close = handle.close();
      expect(release).not.toHaveBeenCalled();
      delivery.resolve();
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      let closed = false;
      void close.then(() => { closed = true; });
      await Promise.resolve();
      expect(closed).toBe(false);
      cleanup.resolve();
      await close;
      expect(closed).toBe(true);
    });
  });

  it("shares one identity across simultaneous listeners and does not unbind the surviving listener", async () => {
    const gateway = new ClientGatewayService();
    const bind = vi.spyOn(gateway, "bindTransportBuildIdentity");
    const release = vi.fn();
    const resolver = async () => ({ gateway, release });
    await withRoutedServer(resolver, async ({ open }) => {
      const first = await open();
      first.sendJson("client.hello", { clientType: "extension" });
      await first.nextMessage("server.pairing_required");
      await withRoutedServer(resolver, async ({ open: another }) => {
        const second = await another();
        second.sendJson("client.hello", { clientType: "extension" });
        await second.nextMessage("server.pairing_required");
        expect(bind).toHaveBeenCalledTimes(1);
      }, { buildIdentity: IDENTITY });
      expect(gateway.readTransportBuildIdentity()?.artifactDigest).toBe(IDENTITY.artifactDigest);
      expect(release).toHaveBeenCalledTimes(1);
    }, { buildIdentity: IDENTITY });
    expect(gateway.readTransportBuildIdentity()).toBeNull();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("releases a disabled authorized gateway without connecting it", async () => {
    const gateway = new ClientGatewayService({ enabled: false });
    const connect = vi.spyOn(gateway, "connect");
    const release = vi.fn();
    await withRoutedServer(async () => ({ gateway, release }), async ({ open, primary }) => {
      const primaryConnect = vi.spyOn(primary, "connect");
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      expect((await client.closed).code).toBe(1008);
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      expect(connect).not.toHaveBeenCalled();
      expect(primaryConnect).not.toHaveBeenCalled();
    });
  });

  it("reports an acquired cleanup failure without exposing its error or credential", async () => {
    const gateway = new ClientGatewayService();
    const release = vi.fn(async () => { throw new Error("fixture-private-cleanup-credential"); });
    await expect(withRoutedServer(async () => ({ gateway, release }), async ({ open, handle }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      await client.nextMessage("server.pairing_required");
      await handle.close();
    })).rejects.toThrow("Client gateway route cleanup failed.");
    expect(release).toHaveBeenCalledTimes(1);
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "transport.route_release_failed")).toBe(true);
    expect(JSON.stringify(gateway.snapshot().auditLog)).not.toContain("fixture-private-cleanup-credential");
  });
});
