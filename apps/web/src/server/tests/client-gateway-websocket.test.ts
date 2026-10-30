import { describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { connect, type AddressInfo } from "node:net";
import { ClientGatewayService } from "fluxiq/client-gateway";
import { isLoopbackHost, parseAllowedOrigins, startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerOptions } from "../client-gateway-websocket";
import { createClientGatewayOriginPolicy } from "../client-gateway-websocket/index.ts";
import { openRawWebSocket } from "../client-gateway-websocket/tests/raw-websocket-client.ts";

const CHROME_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

describe("client gateway websocket server helpers", () => {
  it("parses allowed origins from env-style comma lists", () => {
    expect(parseAllowedOrigins("chrome-extension://abc, moz-extension://def ")).toEqual([
      "chrome-extension://abc",
      "moz-extension://def"
    ]);
    expect(parseAllowedOrigins("  ")).toBeUndefined();
  });

  it("recognizes only explicit loopback listener hosts", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
  });
});

describe("Origin admission follows the contract grammar (N7)", () => {
  const warn = () => undefined;
  const policy = (profile: "local" | "self-hosted" | "service", host: string, allowedOrigins?: string[]) => createClientGatewayOriginPolicy({ profile, host, allowedOrigins, warn });

  it("admits a missing Origin on a non-public gateway even with an allowlist, and refuses it on a public one", () => {
    expect(policy("local", "127.0.0.1", [CHROME_ORIGIN]).admit(undefined)).toEqual({ admitted: true });
    expect(policy("self-hosted", "127.0.0.1", [CHROME_ORIGIN]).admit("")).toEqual({ admitted: true });
    expect(policy("service", "127.0.0.1", [CHROME_ORIGIN]).admit(undefined)).toEqual({ admitted: false, reason: "missing_origin" });
    expect(policy("local", "0.0.0.0", [CHROME_ORIGIN]).admit(undefined)).toEqual({ admitted: false, reason: "missing_origin" });
  });

  it("admits listed origins and the Firefox prefix, and refuses everything else", () => {
    const rule = policy("service", "127.0.0.1", [CHROME_ORIGIN, "moz-extension://*"]);
    expect(rule.admit(CHROME_ORIGIN)).toEqual({ admitted: true });
    expect(rule.admit("moz-extension://0f6f1a2b-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).toEqual({ admitted: true });
    expect(rule.admit("https://app.example")).toEqual({ admitted: false, reason: "origin_not_allowed" });
    expect(rule.admit("chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba")).toEqual({ admitted: false, reason: "origin_not_allowed" });
  });

  it("keeps an open loopback gateway open: no rules admit every Origin", () => {
    expect(policy("local", "127.0.0.1").admit("https://anything.example")).toEqual({ admitted: true });
  });

  it("refuses to start a public gateway with no rules, or with an entry the grammar refuses", () => {
    expect(() => policy("service", "127.0.0.1")).toThrow(/needs an Origin allowlist/);
    expect(() => policy("local", "0.0.0.0", ["*"])).toThrow(/grammar refuses: "\*"/);
    expect(() => policy("service", "127.0.0.1", [CHROME_ORIGIN, "https://*.example.com"])).toThrow(/https:\/\/\*\.example\.com/);
  });

  it("warns about and drops a refused entry on a non-public gateway", () => {
    const warnings: string[] = [];
    const rule = createClientGatewayOriginPolicy({ profile: "local", host: "127.0.0.1", allowedOrigins: ["*", CHROME_ORIGIN], warn: (message) => warnings.push(message) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("\"*\"");
    expect(rule.admit("https://app.example")).toEqual({ admitted: false, reason: "origin_not_allowed" });
    expect(rule.admit(CHROME_ORIGIN)).toEqual({ admitted: true });
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

describe("transport limits and drain over loopback", () => {
  async function withServer(options: Omit<ClientGatewayWebSocketServerOptions, "gateway" | "port">, run: (input: { gateway: ClientGatewayService; open: (origin?: string) => ReturnType<typeof openRawWebSocket>; handle: ReturnType<typeof startClientGatewayWebSocketServer> }) => Promise<void>) {
    const gateway = new ClientGatewayService();
    const handle = startClientGatewayWebSocketServer({ gateway, port: 0, ...options });
    await once(handle.server, "listening");
    const port = (handle.server.address() as AddressInfo).port;
    const clients: Array<{ destroy(): void }> = [];
    const open = async (origin?: string) => {
      const socket = connect({ host: "127.0.0.1", port });
      await once(socket, "connect");
      const client = await openRawWebSocket({ socket, hostHeader: `127.0.0.1:${port}`, path: "/client", ...(origin !== undefined ? { origin } : {}) });
      clients.push(client);
      return client;
    };
    try {
      await run({ gateway, open, handle });
    } finally {
      for (const client of clients) client.destroy();
      await handle.close();
    }
  }
  const auditTypes = (gateway: ClientGatewayService) => gateway.snapshot().auditLog.map((entry) => entry.type);

  it("leaves a local install as it was: no hello deadline and no rate limit", async () => {
    await withServer({}, async ({ open }) => {
      const client = await open();
      expect(client.status).toBe(101);
      for (let index = 0; index < 50; index += 1) client.sendFrame({ opcode: 9, payload: Buffer.from("p") });
      await new Promise((resolve) => setTimeout(resolve, 200));
      client.sendJson("client.hello", { clientType: "extension", name: "Local" });
      await client.nextMessage("server.pairing_required");
    });
  });

  it("closes with 1008 over the rate limit and audits it", async () => {
    await withServer({ limits: { messagesPerSecond: 1, messageBurst: 3 } }, async ({ gateway, open }) => {
      const client = await open(CHROME_ORIGIN);
      for (let index = 0; index < 5; index += 1) client.sendFrame({ opcode: 9, payload: Buffer.from("p") });
      expect((await client.closed).code).toBe(1008);
      expect(auditTypes(gateway)).toContain("transport.rate_limited");
    });
  });

  it("closes with 1009 when a fragmented message grows past the frame cap", async () => {
    await withServer({ limits: { maxFrameBytes: 1024 } }, async ({ gateway, open }) => {
      const client = await open();
      client.sendFrame({ opcode: 1, payload: Buffer.alloc(800, 0x61), fin: false });
      client.sendFrame({ opcode: 0, payload: Buffer.alloc(800, 0x61), fin: false });
      expect((await client.closed).code).toBe(1009);
      const entry = gateway.snapshot().auditLog.find((candidate) => candidate.type === "transport.frame_too_large");
      expect(entry?.metadata).toMatchObject({ declaredBytes: 1600, maxFrameBytes: 1024, clientAddressPrefix: "127.0.0.0/24" });
    });
  });

  it("keeps a socket whose hello came before the deadline", async () => {
    await withServer({ limits: { helloDeadlineMs: 150 } }, async ({ open }) => {
      const client = await open();
      client.sendJson("client.hello", { clientType: "extension", name: "On time" });
      await client.nextMessage("server.pairing_required");
      await new Promise((resolve) => setTimeout(resolve, 300));
      client.sendFrame({ opcode: 9, payload: Buffer.from("still here") });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(client.messages.some((message) => message.type === "server.error")).toBe(false);
      const outcome = await Promise.race([client.closed, new Promise((resolve) => setTimeout(() => resolve("open"), 100))]);
      expect(outcome).toBe("open");
    });
  });

  it("drains: open sockets get server.going_away once, new upgrades get 503, and the count tracks sockets", async () => {
    await withServer({ publicUrl: "wss://gateway.example/client" }, async ({ open, handle }) => {
      expect(handle.publicUrl).toBe("wss://gateway.example/client");
      const first = await open();
      const second = await open();
      expect(handle.openConnectionCount()).toBe(2);
      handle.beginDrain({ retryAfterMs: 2500, reason: "shutdown" });
      handle.beginDrain({ retryAfterMs: 2500 });
      const notice = await first.nextMessage("server.going_away");
      expect(notice.payload).toEqual({ reason: "shutdown", retryAfterMs: 2500 });
      await second.nextMessage("server.going_away");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(first.messages.filter((message) => message.type === "server.going_away")).toHaveLength(1);
      const refused = await open();
      expect(refused.status).toBe(503);
      expect(refused.responseHead).toMatch(/Retry-After: 3/);
      first.destroy();
      await first.closed;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handle.openConnectionCount()).toBe(1);
    });
  });

  it("applies the pending-pairing limits at start", () => {
    const gateway = new ClientGatewayService();
    const setLimits = vi.spyOn(gateway, "setPairingLimits");
    vi.spyOn(gateway, "bindTransportBuildIdentity").mockReturnValue({ activate: vi.fn(), release: vi.fn() });
    expect(() => startClientGatewayWebSocketServer({ gateway, port: -1, limits: { pendingPairingsPerAddress: 5, pendingPairingsTotal: 200 } })).toThrow();
    expect(setLimits).toHaveBeenCalledWith({ perAddress: 5, total: 200 });
  });
});
