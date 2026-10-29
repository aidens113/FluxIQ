import { afterEach, describe, expect, it } from "vitest";
import type { IncomingHttpHeaders } from "node:http";
import { PLATFORM_PROVISIONING_OPERATIONS, platformProvisioningResponseSchema } from "fluxiq/platform";
import { newToken, signUpInput, startListenerHarness, type ListenerHarness, type ListenerReply } from "./listener-fixture";

// The private provisioning listener end to end, over a real socket on
// 127.0.0.1 with the real platform services (memory repositories).

const harnesses: ListenerHarness[] = [];
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

async function start(options: Parameters<typeof startListenerHarness>[0] = {}): Promise<ListenerHarness> {
  const harness = await startListenerHarness(options);
  harnesses.push(harness);
  return harness;
}

function errorCode(reply: ListenerReply): unknown {
  const body = reply.json as { ok?: unknown; error?: { code?: unknown } } | null;
  return body?.ok === false ? body.error?.code : null;
}

function expectNoBrowserHeaders(headers: IncomingHttpHeaders): void {
  expect(headers["set-cookie"]).toBeUndefined();
  expect(Object.keys(headers).filter((name) => name.startsWith("access-control-"))).toEqual([]);
  expect(headers["cache-control"]).toBe("no-store");
}

describe("the private provisioning listener", () => {
  it("creates an account, answers exists on a repeat sign-up, and reads the account back", async () => {
    const harness = await start();
    const created = await harness.post("createAccount", signUpInput({ sendWelcome: true }));
    expect(created.status).toBe(200);
    const result = (created.json as { ok: true; result: { status: string; userId?: string } }).result;
    expect(result.status).toBe("created");
    expect(typeof result.userId).toBe("string");
    expect(harness.email.messages).toHaveLength(1);
    expectNoBrowserHeaders(created.headers);

    const repeated = await harness.post("createAccount", signUpInput({ requestId: "req-signup-2" }));
    expect(repeated.status).toBe(200);
    expect(repeated.json).toEqual({ ok: true, result: { status: "exists" } });

    const account = await harness.post("getAccount", { email: "person@example.test" });
    expect(account.status).toBe(200);
    expect(account.json).toMatchObject({ ok: true, result: { userId: result.userId, email: "person@example.test", status: "active" } });
    expectNoBrowserHeaders(account.headers);
  });

  it("requires the Bearer token and refuses a wrong one", async () => {
    const harness = await start();
    const missing = await harness.post("getAccount", { email: "person@example.test" }, { token: null });
    expect(missing.status).toBe(401);
    expect(errorCode(missing)).toBe("unauthorized");
    expect(missing.headers["www-authenticate"]).toBe("Bearer");
    const wrong = await harness.post("getAccount", { email: "person@example.test" }, { token: newToken() });
    expect(wrong.status).toBe(401);
    expect(errorCode(wrong)).toBe("unauthorized");
    const basic = await harness.post("getAccount", { email: "person@example.test" }, { token: null, headers: { authorization: `Basic ${harness.token}` } });
    expect(basic.status).toBe(401);
    expectNoBrowserHeaders(wrong.headers);
  });

  it("accepts both tokens during a rotation and drops the old one once the file holds only the new one", async () => {
    const harness = await start();
    const next = newToken();
    await harness.writeTokens([harness.token, next]);
    // Within five seconds of the last check the file is not looked at again.
    expect((await harness.post("getAccount", { email: "nobody@example.test" }, { token: next })).status).toBe(401);
    harness.clock.nowMs += 5_000;
    expect((await harness.post("getAccount", { email: "nobody@example.test" }, { token: next })).status).toBe(404);
    expect((await harness.post("getAccount", { email: "nobody@example.test" })).status).toBe(404);

    await harness.writeTokens([next]);
    harness.clock.nowMs += 5_000;
    const old = await harness.post("getAccount", { email: "nobody@example.test" });
    expect(old.status).toBe(401);
    expect((await harness.post("getAccount", { email: "nobody@example.test" }, { token: next })).status).toBe(404);
  });

  it("refuses every token while a rotated file is unusable, and recovers once it is valid", async () => {
    const harness = await start();
    await harness.writeTokens(["too-short"]);
    harness.clock.nowMs += 5_000;
    expect((await harness.post("getAccount", { email: "nobody@example.test" })).status).toBe(401);
    expect(harness.logs.some((line) => line.includes("could not be reloaded") || line.includes("shorter than 32 bytes"))).toBe(true);
    await harness.writeTokens([harness.token]);
    harness.clock.nowMs += 5_000;
    expect((await harness.post("getAccount", { email: "nobody@example.test" })).status).toBe(404);
  });

  it("refuses a source outside the allowlist before anything else, valid token or not", async () => {
    const harness = await start({ allowedCidrs: ["10.0.0.0/8"] });
    const refused = await harness.post("createAccount", signUpInput());
    expect(refused.status).toBe(403);
    expect(errorCode(refused)).toBe("forbidden");
    expect(refused.headers.connection).toBe("close");
    const unknown = await harness.post("setPassword", {}, { token: null });
    expect(unknown.status).toBe(403);
    expect(harness.email.messages).toHaveLength(0);
  });

  it("refuses any request carrying an Origin header", async () => {
    const harness = await start();
    const refused = await harness.post("getAccount", { email: "person@example.test" }, { headers: { origin: "https://getfluxiq.com" } });
    expect(refused.status).toBe(403);
    expect(errorCode(refused)).toBe("forbidden");
    expectNoBrowserHeaders(refused.headers);
  });

  it("serves only POST to an HTTP operation: setPassword, unknown names and other methods are unavailable", async () => {
    const harness = await start();
    const setPassword = await harness.post("setPassword", { userId: "user-1", password: "a long enough dummy password" });
    expect(setPassword.status).toBe(404);
    expect(errorCode(setPassword)).toBe("operation_unavailable");
    expect(setPassword.text).not.toContain("dummy password");
    expect((await harness.post("dropTables", {})).status).toBe(404);
    expect((await harness.post("getAccount", {}, { method: "GET", rawBody: "" })).status).toBe(404);
    expect((await harness.post("getAccount", {}, { method: "OPTIONS", rawBody: "", headers: { origin: "https://getfluxiq.com" } })).status).toBe(404);
    expect((await harness.post("", {}, { path: "/provisioning/" })).status).toBe(404);
  });

  it("refuses a password sent over HTTP, without echoing it", async () => {
    const harness = await start();
    const refused = await harness.post("createAccount", signUpInput({ password: "a long enough dummy password" }));
    expect(refused.status).toBe(400);
    expect(errorCode(refused)).toBe("invalid_input");
    expect(refused.text).not.toContain("dummy password");
    expect(harness.email.messages).toHaveLength(0);
  });

  it("requires application/json and caps the body at 64 KiB", async () => {
    const harness = await start();
    const wrongType = await harness.post("getAccount", { email: "person@example.test" }, { headers: { "content-type": "text/plain" } });
    expect(wrongType.status).toBe(400);
    expect(errorCode(wrongType)).toBe("invalid_input");
    const notJson = await harness.post("getAccount", null, { rawBody: "{not json" });
    expect(notJson.status).toBe(400);
    expect(errorCode(notJson)).toBe("invalid_input");
    const large = await harness.post("createAccount", signUpInput({ displayName: "x".repeat(65 * 1024) }));
    expect(large.status).toBe(413);
    expect(errorCode(large)).toBe("invalid_input");
    const charset = await harness.post("getAccount", { email: "nobody@example.test" }, { headers: { "content-type": "application/json; charset=utf-8" } });
    expect(charset.status).toBe(404);
  });

  it("rate-limits each source over a sliding window", async () => {
    const harness = await start({ rateLimit: { limit: 3, windowMs: 60_000 } });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await harness.post("getAccount", { email: "nobody@example.test" }, { token: null })).status).toBe(401);
    }
    const limited = await harness.post("getAccount", { email: "nobody@example.test" });
    expect(limited.status).toBe(429);
    expect(errorCode(limited)).toBe("rate_limited");
    expect(limited.headers["retry-after"]).toBe("60");
    harness.clock.nowMs += 60_001;
    expect((await harness.post("getAccount", { email: "nobody@example.test" })).status).toBe(404);
  });

  it("logs one line per request with the operation, status, code and duration, and never the token or body", async () => {
    const harness = await start();
    await harness.post("createAccount", signUpInput({ externalId: "site-user-77" }));
    await harness.post("getAccount", { email: "person@example.test" }, { token: null });
    await harness.post("not-an-operation%0Aforged", {});
    expect(harness.logs).toHaveLength(3);
    expect(harness.logs[0]).toMatch(/^\[FluxIQ\] provisioning createAccount 200 - \d+ms$/u);
    expect(harness.logs[1]).toMatch(/^\[FluxIQ\] provisioning getAccount 401 unauthorized \d+ms$/u);
    expect(harness.logs[2]).toMatch(/^\[FluxIQ\] provisioning - 404 operation_unavailable \d+ms$/u);
    const all = harness.logs.join("\n");
    expect(all).not.toContain(harness.token);
    expect(all.toLowerCase()).not.toContain("person@example.test");
    expect(all).not.toContain("site-user-77");
  });

  it("answers a generic 500 when the services cannot be composed", async () => {
    const harness = await start({ getServices: async () => Promise.reject(new Error("database at /secret/path is locked")) });
    const failed = await harness.post("getAccount", { email: "person@example.test" });
    expect(failed.status).toBe(500);
    expect(failed.text).not.toContain("/secret/path");
    expect(errorCode(failed)).toBe("internal_error");
    expect(platformProvisioningResponseSchema(PLATFORM_PROVISIONING_OPERATIONS.getAccount.result).safeParse(failed.json).success).toBe(true);
    expect(harness.logs.at(-1)).toMatch(/^\[FluxIQ\] provisioning getAccount 500 internal_error \d+ms$/u);
  });

  it("answers last_administrator with the contract's 409", async () => {
    const refusal = { ok: false, error: { code: "last_administrator", message: "The last enabled administrator cannot be disabled, deleted or demoted." } } as const;
    const { createTestServices } = await import("./listener-fixture");
    const { services } = await createTestServices();
    const harness = await start({ getServices: async () => ({ provisionerCaller: services.provisionerCaller, provisioning: { ...services.provisioning, run: (async () => refusal) as unknown as typeof services.provisioning.run } }) });
    const refused = await harness.post("disableAccount", { requestId: "d1", userId: "someone", reason: "Review" });
    expect(refused.status).toBe(409);
    expect(refused.json).toEqual(refusal);
    expect(harness.logs.at(-1)).toMatch(/^\[FluxIQ\] provisioning disableAccount 409 last_administrator \d+ms$/u);
  });

  it("lets a request in flight finish when it closes", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const harness = await start({
      getServices: async () => {
        reached();
        await gate;
        const { createTestServices } = await import("./listener-fixture");
        return (await createTestServices()).services;
      }
    });
    const pending = harness.post("getAccount", { email: "nobody@example.test" });
    await arrived;
    const closed = harness.handle.close();
    release();
    expect((await pending).status).toBe(404);
    await closed;
  });
});
