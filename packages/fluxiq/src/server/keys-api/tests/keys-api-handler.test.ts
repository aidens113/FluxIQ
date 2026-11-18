// @fluxiq-test-group real-sql
import { signProof } from "@fluxiq/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { keysApiHandler } from "../index.ts";
import { keyHttpLane } from "./http-lane.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("real SDK / durable key-session HTTP exchange", () => {
  it("discovers the instance, signs an SDK proof, caches its bearer and renews at 80% of lifetime", async () => {
    const lane = await keyHttpLane(cleanups);
    const sdk = lane.sdkSession();
    const first = await sdk.headers();
    expect(first.authorization).toMatch(/^Bearer fxs1\.[A-Za-z0-9_-]{43}$/u);
    expect((await lane.service.authenticate(first.authorization!.slice(7))).principal).toMatchObject({ type: "user", id: lane.binding.userId, workspaceId: lane.binding.workspaceId });
    expect((await sdk.headers()).authorization).toBe(first.authorization);
    expect(lane.exchangeCount()).toBe(1);
    lane.state.nowMs += 2_880_001;
    const renewed = await sdk.headers();
    expect(renewed.authorization).not.toBe(first.authorization);
    expect(lane.exchangeCount()).toBe(2);
    expect((await lane.service.authenticate(renewed.authorization!.slice(7))).keyId).toBe(lane.key.keyId);
    sdk.invalidate();
    expect((await sdk.headers()).authorization).not.toBe(renewed.authorization);
    expect(lane.exchangeCount()).toBe(3);
  });

  it("supports the SDK's single clock-skew correction against the production verifier", async () => {
    const lane = await keyHttpLane(cleanups);
    const sdk = lane.sdkSession(-20 * 60_000);
    expect((await sdk.headers()).authorization).toMatch(/^Bearer fxs1\./u);
    expect(lane.exchangeCount()).toBe(2);
  });

  it("returns safe JSON replay, audience and disabled-account refusals without issuing a bearer", async () => {
    const lane = await keyHttpLane(cleanups);
    const proof = signProof({ key: lane.key, purpose: "session", audience: `${lane.origin}#instance-1`, payload: "{}", now: new Date(lane.state.nowMs) });
    const post = (body: unknown) => fetch(`${lane.origin}/api/keys/session`, { method: "POST", headers: { "FluxIQ-Client": "sdk", "content-type": "application/json" }, body: JSON.stringify(body) });
    const initial = await post(proof);
    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toBe("no-store");
    const issued = await initial.json() as { sessionToken: string };
    const replay = await post(proof);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: { code: "key.replayed", message: "The key credential could not be accepted." } });
    const foreign = await post({ ...proof, aud: "https://evil.example#instance-1" });
    expect(foreign.status).toBe(401);
    expect(await foreign.json()).toMatchObject({ error: { code: "key.bad_audience" } });
    lane.state.eligible = false;
    const refused = await post(signProof({ key: lane.key, purpose: "session", audience: `${lane.origin}#instance-1`, payload: "{}", now: new Date(lane.state.nowMs) }));
    expect(refused.status).toBe(401);
    const text = await refused.text();
    expect(text).not.toContain(issued.sessionToken);
    expect(text).not.toContain(proof.publicKey);
    expect(text).not.toContain(lane.binding.userId);
    await expect(lane.service.authenticate(issued.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
  });

  it("requires the SDK client header, JSON, POST and its exact path, and rejects oversized/malformed bodies", async () => {
    const lane = await keyHttpLane(cleanups);
    const target = `${lane.origin}/api/keys/session`;
    const headers = { "FluxIQ-Client": "sdk", "content-type": "application/json" };
    for (const request of [
      { headers: { "content-type": "application/json" }, body: "{}" },
      { headers: { "FluxIQ-Client": "sdk", "content-type": "text/plain" }, body: "{}" },
      { headers, body: "{" },
      { headers, body: "x".repeat(9000) },
      { headers, body: "[]" }
    ]) {
      const response = await fetch(target, { method: "POST", headers: request.headers, body: request.body });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "key.bad_proof" } });
    }
    const get = await fetch(target, { headers });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    await get.text();
    const missing = await fetch(`${lane.origin}/api/keys/enroll`, { method: "POST", headers, body: "{}" });
    expect(missing.status).toBe(404);
    await missing.text();
  });

  it("maps internal failures to an unavailable response without leaking diagnostics or enabling unkeyed fallback", async () => {
    const lane = await keyHttpLane(cleanups);
    lane.replaceHandler(keysApiHandler({ exchange: async () => { throw new Error("private database diagnostic"); } }));
    const response = await fetch(`${lane.origin}/api/keys/session`, { method: "POST", headers: { "FluxIQ-Client": "sdk", "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "key.unavailable", message: "Key authentication is temporarily unavailable." } });
    await expect(lane.sdkSession().headers()).rejects.toMatchObject({ status: 503, apiCode: "key.unavailable" });
  });
});
