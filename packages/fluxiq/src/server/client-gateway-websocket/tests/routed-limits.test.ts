import { describe, expect, it, vi } from "vitest";
import { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { ClientGatewayRouteLease } from "../routing/index.ts";
import { deferred, withRoutedServer } from "./routed-server.ts";

describe("routing keeps transport protections active", () => {
  it.each([
    "{invalid json",
    JSON.stringify({ id: "fixture", type: "client.hello", timestamp: 1, protocolVersion: "0.1", payload: null }),
    JSON.stringify({ id: "fixture", type: "client.hello", timestamp: 1, protocolVersion: "0.1", payload: { clientType: "unregistered" } }),
    JSON.stringify({ id: "fixture", type: "client.hello", timestamp: 1, protocolVersion: "0.1", payload: { clientType: "extension", token: 12 } }),
    JSON.stringify({ id: "fixture", type: "client.hello", timestamp: 1, protocolVersion: "2.0", payload: { clientType: "extension" } }),
    JSON.stringify({ id: "fixture", type: "client.state_update", timestamp: 1, protocolVersion: "0.1", payload: {} })
  ])("invalid first hello never reaches resolver or primary (%s)", async (text) => {
    const resolver = vi.fn(async () => null);
    await withRoutedServer(resolver, async ({ open, primary }) => {
      const connect = vi.spyOn(primary, "connect");
      const client = await open();
      client.sendText(text);
      expect((await client.closed).code).toBe(1008);
      expect(resolver).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    });
  });

  it("keeps the hello deadline running throughout async resolution", async () => {
    const route = deferred<ClientGatewayRouteLease | null>();
    let signal: AbortSignal | undefined;
    await withRoutedServer(async (input) => {
      signal = input.signal;
      return route.promise;
    }, async ({ open, primary }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      expect((await client.closed).code).toBe(1008);
      expect(signal?.aborted).toBe(true);
      expect(primary.snapshot().auditLog.some((event) => event.type === "transport.hello_deadline")).toBe(true);
      route.resolve(null);
    }, { limits: { maxFrameBytes: 4096, helloDeadlineMs: 100 } });
  });

  it.each(["frame", "pending", "rate"])("enforces %s limit while the resolver is pending", async (kind) => {
    const gateway = new ClientGatewayService();
    const connect = vi.spyOn(gateway, "connect");
    const route = deferred<ClientGatewayRouteLease | null>();
    const release = vi.fn();
    let signal: AbortSignal | undefined;
    await withRoutedServer(async (input) => {
      signal = input.signal;
      return route.promise;
    }, async ({ open }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension" });
      await vi.waitFor(() => expect(signal).toBeDefined());
      if (kind === "frame") client.sendFrame({ opcode: 1, declaredLength: 4096 });
      if (kind === "pending") {
        client.sendText("x".repeat(700));
        client.sendText("x".repeat(700));
      }
      if (kind === "rate") {
        for (let index = 0; index < 4; index += 1) client.sendFrame({ opcode: 9 });
      }
      expect((await client.closed).code).toBe(kind === "rate" ? 1008 : 1009);
      expect(signal?.aborted).toBe(true);
      route.resolve({ gateway, release });
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      expect(connect).not.toHaveBeenCalled();
    }, { limits: { maxFrameBytes: 1024, helloDeadlineMs: 2000, messagesPerSecond: 1, messageBurst: kind === "rate" ? 3 : 100 } });
  });
});
