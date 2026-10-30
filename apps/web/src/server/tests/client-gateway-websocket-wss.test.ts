// Lane validation for the hosted gateway transport: the server runs under the
// `service` profile behind a TLS-terminating proxy, as Caddy would front it,
// and a client speaks wss to the proxy. Caddy itself is not run; a Node TLS
// proxy stands in for it, with a throwaway self-signed certificate made at
// test time with openssl and deleted afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { connect as connectTcp, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as connectTls, createServer as createTlsServer, type Server as TlsServer, type TLSSocket } from "node:tls";
import { ClientGatewayService } from "fluxiq/client-gateway";
import { startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerHandle } from "../client-gateway-websocket";
import { openRawWebSocket } from "../client-gateway-websocket/tests/raw-websocket-client.ts";

const CHROME_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
// The address the stand-in proxy appends as the one the client connected from.
const PROXY_SEEN_ADDRESS = "198.51.100.23";
// An X-Forwarded-For entry the client sends itself; a trusted proxy's rightmost entry must win over it.
const SPOOFED_ADDRESS = "10.9.9.9";

function findOpenssl(): string | null {
  const candidates = [process.env.OPENSSL, "openssl", "C:/Program Files/Git/mingw64/bin/openssl.exe", "C:/Program Files/Git/usr/bin/openssl.exe"];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const probe = spawnSync(candidate, ["version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const openssl = findOpenssl();

describe.skipIf(openssl === null)("client gateway over wss behind a TLS proxy (service profile)", () => {
  let certDir = "";
  let cert = "";
  let gateway: ClientGatewayService;
  let handle: ClientGatewayWebSocketServerHandle;
  let proxy: TlsServer;
  let proxyPort = 0;
  const sockets = new Set<Socket | TLSSocket>();

  beforeAll(async () => {
    certDir = mkdtempSync(join(tmpdir(), "fluxiq-wss-"));
    const keyPath = join(certDir, "key.pem");
    const certPath = join(certDir, "cert.pem");
    execFileSync(openssl!, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    cert = readFileSync(certPath, "utf8");
    const key = readFileSync(keyPath, "utf8");

    gateway = new ClientGatewayService();
    handle = startClientGatewayWebSocketServer({
      gateway,
      port: 0,
      profile: "service",
      allowedOrigins: [CHROME_ORIGIN],
      trustProxy: true,
      publicUrl: "wss://localhost/client",
      limits: { maxFrameBytes: 64 * 1024, helloDeadlineMs: 300, messagesPerSecond: 50, messageBurst: 200, pendingPairingsPerAddress: 5, pendingPairingsTotal: 1000 }
    });
    await once(handle.server, "listening");
    const gatewayPort = (handle.server.address() as AddressInfo).port;

    proxy = createTlsServer({ key, cert }, (client) => {
      sockets.add(client);
      let head = Buffer.alloc(0);
      const onData = (chunk: Buffer) => {
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf("\r\n\r\n");
        if (end < 0) return;
        client.off("data", onData);
        client.pause();
        const lines = head.subarray(0, end).toString("latin1").split("\r\n");
        const forwarded = lines.find((line) => /^x-forwarded-for:/iu.test(line));
        const kept = lines.filter((line) => line !== forwarded);
        const prior = forwarded ? `${forwarded.slice(forwarded.indexOf(":") + 1).trim()}, ` : "";
        const rewritten = `${[...kept, `X-Forwarded-For: ${prior}${PROXY_SEEN_ADDRESS}`].join("\r\n")}\r\n\r\n`;
        const upstream = connectTcp({ host: "127.0.0.1", port: gatewayPort }, () => {
          upstream.write(Buffer.concat([Buffer.from(rewritten, "latin1"), head.subarray(end + 4)]));
          client.pipe(upstream);
          upstream.pipe(client);
          client.resume();
        });
        sockets.add(upstream);
        upstream.on("close", () => client.destroy());
        client.on("close", () => upstream.destroy());
        upstream.on("error", () => client.destroy());
      };
      client.on("data", onData);
      client.on("error", () => client.destroy());
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    proxyPort = (proxy.address() as AddressInfo).port;
  });

  afterAll(async () => {
    // The throwaway key goes first, so a listener that is slow to close can never leave it behind.
    if (certDir) rmSync(certDir, { recursive: true, force: true });
    for (const socket of sockets) socket.destroy();
    if (proxy) await new Promise<void>((resolve) => proxy.close(() => resolve()));
    if (handle) await handle.close();
  });

  async function openWss(input: { origin?: string; headers?: Record<string, string> }) {
    const socket = connectTls({ host: "127.0.0.1", port: proxyPort, ca: cert, servername: "localhost" });
    sockets.add(socket);
    await once(socket, "secureConnect");
    expect(socket.authorized).toBe(true);
    return openRawWebSocket({ socket, hostHeader: "localhost", path: "/client", ...input });
  }

  const auditEntries = (type: string) => gateway.snapshot().auditLog.filter((entry) => entry.type === type);

  it("takes a wss hello from an allowed extension Origin to server.pairing_required", async () => {
    const client = await openWss({ origin: CHROME_ORIGIN });
    expect(client.status).toBe(101);
    client.sendJson("client.hello", { clientType: "extension", name: "WSS lane test" });
    const pairing = await client.nextMessage("server.pairing_required");
    expect(pairing.type).toBe("server.pairing_required");
    client.destroy();
  });

  it("answers a web Origin and a missing Origin with 403, and audits both", async () => {
    const web = await openWss({ origin: "https://evil.example" });
    expect(web.status).toBe(403);
    const missing = await openWss({});
    expect(missing.status).toBe(403);
    const reasons = auditEntries("transport.origin_refused").map((entry) => entry.metadata?.reason);
    expect(reasons).toEqual(expect.arrayContaining(["origin_not_allowed", "missing_origin"]));
    for (const entry of auditEntries("transport.origin_refused")) expect(entry.metadata?.clientAddressPrefix).toBe("198.51.100.0/24");
  });

  it("closes an oversized frame with 1009 from its declared length alone", async () => {
    const client = await openWss({ origin: CHROME_ORIGIN });
    expect(client.status).toBe(101);
    client.sendFrame({ opcode: 1, payload: Buffer.alloc(16, 0x61), declaredLength: 1024 * 1024 });
    expect((await client.closed).code).toBe(1009);
    expect(auditEntries("transport.frame_too_large").at(-1)?.metadata).toMatchObject({ declaredBytes: 1024 * 1024, maxFrameBytes: 64 * 1024 });
  });

  it("drops a silent socket at the hello deadline with 1008", async () => {
    const client = await openWss({ origin: CHROME_ORIGIN });
    expect(client.status).toBe(101);
    const started = Date.now();
    expect((await client.closed).code).toBe(1008);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(auditEntries("transport.hello_deadline").length).toBeGreaterThanOrEqual(1);
  });

  it("with trustProxy, audits the session under the proxy-appended address's prefix, not a spoofed entry", async () => {
    const client = await openWss({ origin: CHROME_ORIGIN, headers: { "X-Forwarded-For": SPOOFED_ADDRESS } });
    expect(client.status).toBe(101);
    client.sendJson("client.hello", { clientType: "extension", name: "Forwarded" });
    await client.nextMessage("server.pairing_required");
    const connected = auditEntries("session.connected").at(-1);
    expect(connected?.metadata?.clientAddressPrefix).toBe("198.51.100.0/24");
    expect(JSON.stringify(gateway.snapshot())).not.toContain(PROXY_SEEN_ADDRESS);
    expect(JSON.stringify(gateway.snapshot())).not.toContain(SPOOFED_ADDRESS);
    client.destroy();
  });
});
