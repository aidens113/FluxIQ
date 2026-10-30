import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { DurableLoginAttemptTracker } from "../../../../lib/login-attempts";
import { ownerClaimPaths, prepareOwnerClaim } from "../../../../server/owner-claim";
import { createOwnerClaimInstance, type OwnerClaimInstance } from "../../../../server/owner-claim/tests/owner-claim-instance";
import type { SetupResponse } from "../SetupResponse";
import { submitOwnerClaim } from "../submitOwnerClaim";

// The setup submit end to end over a real FluxIQ instance in a temporary
// root. Every password and code here is a dummy value.
const PASSWORD = "a dummy owner password";
const URL_ = "https://fluxiq.example.test/setup/submit";

let instance: OwnerClaimInstance;
let lines: string[];
let consoleLines: string[];

beforeEach(async () => {
  instance = await createOwnerClaimInstance();
  lines = [];
  consoleLines = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void consoleLines.push(args.map(String).join(" ")));
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  await instance.close();
});

function attempts() {
  const security = path.join(instance.fluxiqDir, "security");
  const options = { windowMs: 10 * 60 * 1000, lockoutMs: 10 * 60 * 1000, maxAttempts: 10 };
  return {
    global: new DurableLoginAttemptTracker(path.join(security, "test-setup-attempts.json"), options),
    address: new DurableLoginAttemptTracker(path.join(security, "test-setup-address-attempts.json"), { ...options, maxAttempts: 5 })
  };
}

function deps(env: Record<string, string> = {}, tracker = attempts()) {
  return {
    settings: instance.settings(env),
    fluxiqDir: instance.fluxiqDir,
    provisioning: instance.services.provisioning,
    identityAccess: instance.fluxiq.programs.identityAccess,
    secretKeys: instance.fluxiq.programs.secretKeys,
    attempts: tracker,
    log: (line: string) => lines.push(line)
  };
}

function form(code: string, overrides: Record<string, string> = {}) {
  return { code, username: "owner@example.test", displayName: "The Owner", password: PASSWORD, confirmation: PASSWORD, ...overrides };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

async function generatedCode(): Promise<string> {
  await prepareOwnerClaim({ settings: instance.settings(), fluxiqDir: instance.fluxiqDir });
  return (await readFile(ownerClaimPaths(instance.fluxiqDir).generatedCode, "utf8")).trim();
}

function expectNothingLeaked(answers: SetupResponse[], secrets: string[]) {
  const text = [...answers.map((answer) => JSON.stringify({ body: answer.body, headers: answer.headers })), ...lines, ...consoleLines].join("\n");
  for (const secret of secrets) expect(text).not.toContain(secret);
}

describe("submitOwnerClaim", () => {
  it("claims the instance with the setup code, signs the owner in and retires admin/admin", { timeout: 90_000 }, async () => {
    const code = await generatedCode();
    const answer = await submitOwnerClaim(post(form(code)), deps());
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true, redirectTo: "/" });
    expect(answer.session).toBeDefined();

    const identity = instance.fluxiq.programs.identityAccess;
    const signedIn = await identity.validateSession(answer.session?.id);
    expect(signedIn?.user).toMatchObject({ username: "owner@example.test", roleId: "admin" });
    const userId = signedIn?.user.id ?? "";
    expect((await instance.services.store.getMembership("workspace-main", userId))?.policies).toEqual(["FluxIQOwnerFullAccess"]);
    expect((await instance.services.store.getAccount(userId))?.lastSignInAtMs).not.toBeNull();
    await expect(identity.authenticate({ username: "admin", password: "admin" })).rejects.toThrow();

    // Claimed: the route is gone, even with the right code, and the generated code file with it.
    const again = await submitOwnerClaim(post(form(code, { username: "second@example.test" })), deps());
    expect(again).toEqual({ status: 404, body: { ok: false, code: "not_found" } });
    await expect(readFile(ownerClaimPaths(instance.fluxiqDir).generatedCode, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expectNothingLeaked([answer, again], [code, PASSWORD]);
  });

  it("refuses a wrong code, then throttles every attempt including the right code", { timeout: 90_000 }, async () => {
    const code = await generatedCode();
    const wrong = "0".repeat(40);
    const tracker = attempts();
    const answers: SetupResponse[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const answer = await submitOwnerClaim(post(form(wrong)), deps({}, tracker));
      answers.push(answer);
      expect(answer).toEqual({ status: 401, body: { ok: false, code: "invalid_code" } });
    }
    const throttled = await submitOwnerClaim(post(form(code)), deps({}, tracker));
    answers.push(throttled);
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({ ok: false, code: "rate_limited" });
    expect(throttled.headers?.["retry-after"]).toMatch(/^\d+$/u);
    expect((await instance.fluxiq.programs.identityAccess.snapshot()).users.map((user) => user.id)).toEqual(["admin"]);
    expectNothingLeaked(answers, [code, wrong, PASSWORD]);
  });

  it("throttles per client address only behind a trusted proxy", { timeout: 90_000 }, async () => {
    const code = await generatedCode();
    const wrong = "1".repeat(40);
    const tracker = attempts();
    const proxied = deps({ FLUXIQ_TRUST_PROXY: "true" }, tracker);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await submitOwnerClaim(post(form(wrong), { "x-forwarded-for": "203.0.113.7" }), proxied)).status).toBe(401);
    }
    expect((await submitOwnerClaim(post(form(code), { "x-forwarded-for": "203.0.113.7" }), proxied)).status).toBe(429);
    // Another address is not locked out by the first one's failures.
    expect((await submitOwnerClaim(post(form(code), { "x-forwarded-for": "198.51.100.4" }), proxied)).status).toBe(200);
  });

  it("is not found on local, before the body is read", async () => {
    const local = { ...deps(), settings: resolveFluxIQDeploymentSettings({}) };
    expect(await submitOwnerClaim(post(form("whatever-dummy-code-123")), local)).toEqual({ status: 404, body: { ok: false, code: "not_found" } });
    expect(await submitOwnerClaim(new Request(URL_, { method: "POST", body: "{not json" }), local)).toEqual({ status: 404, body: { ok: false, code: "not_found" } });
  });

  it("is not found once claimed", async () => {
    await mkdir(ownerClaimPaths(instance.fluxiqDir).securityDir, { recursive: true });
    await writeFile(ownerClaimPaths(instance.fluxiqDir).marker, JSON.stringify({ schemaVersion: 1, claimedAt: "2026-10-29T00:00:00.000Z", ownerUserId: "someone" }));
    expect(await submitOwnerClaim(post(form("whatever-dummy-code-123")), deps())).toEqual({ status: 404, body: { ok: false, code: "not_found" } });
  });

  it("accepts the code in FLUXIQ_SETUP_CODE_FILE and not a generated one", { timeout: 90_000 }, async () => {
    const generated = await generatedCode();
    const codeFile = path.join(instance.root, "operator-setup-code.txt");
    await writeFile(codeFile, "operator-dummy-setup-code-4567\n");
    const configured = deps({ FLUXIQ_SETUP_CODE_FILE: codeFile });
    expect((await submitOwnerClaim(post(form(generated)), configured)).status).toBe(401);
    const answer = await submitOwnerClaim(post(form(" operator-dummy-setup-code-4567 ")), configured);
    expect(answer.status).toBe(200);
    // The operator's file is theirs: never removed.
    expect((await readFile(codeFile, "utf8")).trim()).toBe("operator-dummy-setup-code-4567");
    expectNothingLeaked([answer], ["operator-dummy-setup-code-4567", generated, PASSWORD]);
  });

  it("refuses a mismatched confirmation, a bad form and a cross-site post without echoing them", { timeout: 60_000 }, async () => {
    const code = await generatedCode();
    const mismatch = await submitOwnerClaim(post(form(code, { confirmation: "another dummy password" })), deps());
    expect(mismatch).toEqual({ status: 400, body: { ok: false, code: "password_mismatch", fields: ["confirmation"] } });
    const missing = await submitOwnerClaim(post({ code, password: PASSWORD }), deps());
    expect(missing).toEqual({ status: 400, body: { ok: false, code: "invalid_input", fields: ["username", "displayName", "confirmation"] } });
    const notEmail = await submitOwnerClaim(post(form(code, { username: "not-an-email" })), deps());
    expect(notEmail).toEqual({ status: 400, body: { ok: false, code: "invalid_input", fields: ["username"] } });
    const crossSite = await submitOwnerClaim(post(form(code), { origin: "https://evil.example.test" }), deps());
    expect(crossSite).toEqual({ status: 403, body: { ok: false, code: "forbidden" } });
    const weak = await submitOwnerClaim(post(form(code, { password: "short-dummy", confirmation: "short-dummy" })), deps());
    expect(weak).toEqual({ status: 422, body: { ok: false, code: "weak_password", fields: ["password"] } });
    expectNothingLeaked([mismatch, missing, notEmail, crossSite, weak], [code, PASSWORD, "short-dummy"]);
  });
});
