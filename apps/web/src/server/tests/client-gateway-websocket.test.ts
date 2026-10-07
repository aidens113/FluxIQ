import { describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { ClientGatewayService } from "fluxiq/client-gateway";
import { isLoopbackHost, isOriginAllowed, parseAllowedOrigins, startClientGatewayWebSocketServer } from "../client-gateway-websocket";

describe("client gateway websocket server helpers", () => {
  it("parses allowed origins from env-style comma lists", () => {
    expect(parseAllowedOrigins("chrome-extension://abc, moz-extension://def ")).toEqual([
      "chrome-extension://abc",
      "moz-extension://def"
    ]);
    expect(parseAllowedOrigins("  ")).toBeUndefined();
  });

  it("allows all origins until an allow-list is configured", () => {
    expect(isOriginAllowed("chrome-extension://abc")).toBe(true);
    expect(isOriginAllowed("chrome-extension://abc", ["chrome-extension://abc"])).toBe(true);
    expect(isOriginAllowed("chrome-extension://other", ["chrome-extension://abc"])).toBe(false);
    expect(isOriginAllowed(undefined, ["chrome-extension://abc"])).toBe(false);
  });

  it("recognizes only explicit loopback listener hosts", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
  });
});


it("uninstrumented source factory never attests prior stamped identity and closes its listening lease", async () => {
  const gateway = new ClientGatewayService();
  gateway.bindTransportBuildIdentity({ schema: 1, protocol: "fluxiq.module-build-identity.v1", moduleId: "fluxiq/web-client-gateway-server", version: "0.1.0", normalization: "module-payload-v1", artifactDigest: "a".repeat(64), sourceInputsDigest: "b".repeat(64) }).activate();
  const handle = startClientGatewayWebSocketServer({ gateway, port: 0 });
  expect(gateway.readTransportBuildIdentity()).toBeNull();
  try { await once(handle.server, "listening"); expect(handle.status.listening).toBe(true); expect(gateway.readTransportBuildIdentity()).toBeNull(); }
  finally { await handle.close(); }
  expect(handle.status.listening).toBe(false);
});
it("capture refusal occurs before listener creation; synchronous listen failure releases lease", () => {
  const gateway = new ClientGatewayService();
  const bind = vi.spyOn(gateway, "bindTransportBuildIdentity").mockImplementationOnce(() => { throw new Error("identity changed"); });
  expect(() => startClientGatewayWebSocketServer({ gateway, port: 0 })).toThrow(/identity changed/);
  expect(bind).toHaveBeenCalledTimes(1); bind.mockRestore();
  const release = vi.fn(); vi.spyOn(gateway, "bindTransportBuildIdentity").mockReturnValue({ activate: vi.fn(), release });
  expect(() => startClientGatewayWebSocketServer({ gateway, port: -1 })).toThrow(); expect(release).toHaveBeenCalledTimes(1);
});
