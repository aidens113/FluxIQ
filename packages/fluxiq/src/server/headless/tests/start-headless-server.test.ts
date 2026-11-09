// @fluxiq-test-group real-sql
// The headless server, end to end on ephemeral loopback ports: a client says
// hello on the gateway and is asked to pair, a person's approval gives it a
// token, and the program route answers that token over plain HTTP exactly as
// the web panel's route does: allowlisted endpoints only, nothing without it.
import { mkdtemp, rm } from "node:fs/promises";
import { connect, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FluxIQ } from "../../../framework/index.ts";
import { openRawWebSocket, type RawWebSocketClient } from "../../tests/raw-websocket-client.ts";
import { initializeFluxIQServerStorage, startHeadlessServer, type HeadlessServerHandle } from "../index.ts";

const CHROME_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const PERSON = { id: "user.headless", username: "headless", displayName: "Headless", roleId: "viewer" };

describe("headless server", () => {
  let root = "";
  let fluxiq: FluxIQ;
  let server: HeadlessServerHandle;
  let socket: Socket;
  let client: RawWebSocketClient;
  let token = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-headless-"));
    fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
    await initializeFluxIQServerStorage(fluxiq);
    await fluxiq.programs.identityAccess.upsertUser(PERSON);
    server = await startHeadlessServer({ fluxiq, apiPort: 0, gatewayPort: 0 });
  });

  afterAll(async () => {
    client?.destroy();
    socket?.destroy();
    await server?.close();
    await fluxiq?.close();
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("fluxiq-headless-")) throw new Error("Refusing cleanup outside the test's own root");
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("listens on loopback and names both addresses", () => {
    expect(server.apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(server.gatewayUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/client$/u);
    expect(server.gateway.status.listening).toBe(true);
  });

  it("asks a client that says hello to pair, and gives it a token once a person approves", async () => {
    const gatewayUrl = new URL(server.gatewayUrl);
    socket = connect(Number(gatewayUrl.port), gatewayUrl.hostname);
    client = await openRawWebSocket({ socket, hostHeader: gatewayUrl.host, path: gatewayUrl.pathname, origin: CHROME_ORIGIN });
    expect(client.status).toBe(101);
    client.sendJson("client.hello", { clientType: "extension", name: "Headless test" });
    const pairing = await client.nextMessage("server.pairing_required");
    expect(pairing.payload.reason).toEqual(expect.any(String));

    const pending = fluxiq.programs.clientGateway.snapshot().pairings[0]!;
    await fluxiq.programs.clientGateway.approvePairing(pending.pairingCode, { approvedByUserId: PERSON.id });
    const ready = await client.nextMessage("server.session_ready");
    token = String(ready.payload.token);
    expect(token).not.toBe("");
  });

  it("answers a paired client's token on an allowlisted endpoint over HTTP", async () => {
    const response = await call("automation-studio", "list-conversations", { authorization: `Bearer ${token}` });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("refuses a call with no credential, a bad token, and a token on an endpoint it may not call", async () => {
    const none = await call("automation-studio", "list-conversations", {});
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ ok: false, error: "Authentication required" });
    expect((await call("automation-studio", "list-conversations", { authorization: "Bearer not-a-token" })).status).toBe(401);
    const outside = await call("identity-access", "snapshot", { authorization: `Bearer ${token}` });
    expect(outside.status).toBe(403);
    expect(await outside.json()).toEqual({ ok: false, error: "This endpoint is not available to a paired client." });
  });

  it("answers anything but the program route with 404", async () => {
    const response = await fetch(`${server.apiUrl}/api/discovery`);
    expect(response.status).toBe(404);
  });

  async function call(programId: string, endpoint: string, headers: Record<string, string>): Promise<Response> {
    return fetch(`${server.apiUrl}/api/programs/${programId}/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({})
    });
  }
});
