import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DurableLoginAttemptTracker } from "../../../../lib/login-attempts";
import { localSetupCode } from "../../../../server/owner-claim";
import { createLocalInstance, type LocalInstance } from "../../../../server/owner-claim/local/tests/local-instance";
import type { SetupResponse } from "../SetupResponse";
import { submitLocalOwnerClaim } from "../submitLocalOwnerClaim";

// The local setup submit end to end over a real identity store: a new install
// and an install whose admin is still on the temporary password. Every
// password and code here is a dummy value.

const PASSWORD = "a dummy owner password";
const SUBMIT = "http://127.0.0.1:3200/setup/submit";

let instance: LocalInstance;
let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  localSetupCode.spend();
  await instance?.close();
});

function deps(nowMs?: number) {
  const security = path.join(instance.fluxiq.paths.fluxiq, "security");
  return {
    identity: instance.fluxiq.programs.identityAccess,
    restoreKeys: vi.fn(async () => undefined),
    attempts: { global: new DurableLoginAttemptTracker(path.join(security, "test-local-setup-attempts.json"), { windowMs: 600_000, lockoutMs: 600_000, maxAttempts: 10 }) },
    log: (line: string) => lines.push(line),
    ...(nowMs === undefined ? {} : { nowMs: () => nowMs })
  };
}

function post(body: unknown, init: { url?: string; headers?: Record<string, string> } = {}): Request {
  return new Request(init.url ?? SUBMIT, {
    method: "POST",
    headers: { "content-type": "application/json", host: "127.0.0.1:3200", origin: "http://127.0.0.1:3200", "sec-fetch-site": "same-origin", ...init.headers },
    body: JSON.stringify(body)
  });
}

function form(code: string, overrides: Record<string, string> = {}) {
  return { code, username: "aiden-dummy", password: PASSWORD, confirmation: PASSWORD, ...overrides };
}

function expectNothingLeaked(answers: SetupResponse[], secrets: string[]) {
  const text = [...answers.map((answer) => JSON.stringify({ body: answer.body, headers: answer.headers })), ...lines].join("\n");
  for (const secret of secrets) expect(text).not.toContain(secret);
}

describe("submitLocalOwnerClaim", { timeout: 120_000 }, () => {
  it("a new install: the code from the link creates the owner with the chosen name and signs them in, once", async () => {
    instance = await createLocalInstance("new-install");
    const identity = instance.fluxiq.programs.identityAccess;
    const { code } = localSetupCode.issue();
    const setup = deps();
    const answer = await submitLocalOwnerClaim(post(form(code)), setup);
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ ok: true, redirectTo: "/" });
    const signedIn = await identity.validateSession(answer.session?.id);
    expect(signedIn?.user).toMatchObject({ username: "aiden-dummy", displayName: "aiden-dummy", roleId: "admin" });
    expect(setup.restoreKeys).toHaveBeenCalledOnce();
    expect(await identity.firstRun.state()).toBe("claimed");
    await expect(identity.authenticate({ username: "admin", password: "admin" })).rejects.toThrow();

    // Single use: the same link again finds an owner, and the code itself is spent.
    const again = await submitLocalOwnerClaim(post(form(code, { username: "someone-else" })), deps());
    expect(again).toEqual({ status: 404, body: { ok: false, code: "not_found" } });
    expect(localSetupCode.check(code)).toBe("none");
    expect((await identity.snapshot()).users).toHaveLength(1);
    expectNothingLeaked([answer, again], [code, PASSWORD]);
  });

  it("an existing install: the admin still on the temporary password becomes the owner's account, and its old sessions end", async () => {
    instance = await createLocalInstance("existing-install");
    const identity = instance.fluxiq.programs.identityAccess;
    const before = await identity.createSession("admin");
    const { code } = localSetupCode.issue();
    const answer = await submitLocalOwnerClaim(post(form(code)), deps());
    expect(answer.status).toBe(200);
    const signedIn = await identity.validateSession(answer.session?.id);
    expect(signedIn?.user).toMatchObject({ id: "admin", username: "aiden-dummy" });
    expect(await identity.validateSession(before.id)).toBeNull();
    expect((await identity.snapshot()).sessions).toHaveLength(1);
    await expect(identity.authenticate({ username: "admin", password: "admin" })).rejects.toThrow();
    await expect(identity.authenticate({ username: "aiden-dummy", password: "admin" })).rejects.toThrow();
    expect(await identity.firstRun.state()).toBe("claimed");
  });

  it("refuses a wrong code, then throttles every attempt including the right code", async () => {
    instance = await createLocalInstance("new-install");
    const { code } = localSetupCode.issue();
    const setup = deps();
    const wrong = "0".repeat(40);
    const answers: SetupResponse[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const answer = await submitLocalOwnerClaim(post(form(wrong)), setup);
      answers.push(answer);
      expect(answer).toEqual({ status: 401, body: { ok: false, code: "invalid_code" } });
    }
    const throttled = await submitLocalOwnerClaim(post(form(code)), setup);
    expect(throttled.status).toBe(429);
    expect(await instance.fluxiq.programs.identityAccess.firstRun.state()).toBe("unclaimed");
    expectNothingLeaked([...answers, throttled], [code, wrong, PASSWORD]);
  });

  it("refuses an expired code, and any code when this start issued none", async () => {
    instance = await createLocalInstance("new-install");
    const { code, expiresAtMs } = localSetupCode.issue(1_000);
    expect(await submitLocalOwnerClaim(post(form(code)), deps(expiresAtMs))).toEqual({ status: 410, body: { ok: false, code: "setup_expired" } });
    localSetupCode.spend();
    expect(await submitLocalOwnerClaim(post(form(code)), deps())).toEqual({ status: 503, body: { ok: false, code: "setup_unavailable" } });
    expect(await instance.fluxiq.programs.identityAccess.firstRun.state()).toBe("unclaimed");
  });

  it("reads the code from the body only: a code in the URL is no code", async () => {
    instance = await createLocalInstance("new-install");
    const { code } = localSetupCode.issue();
    const { code: _omitted, ...withoutCode } = form(code);
    const inQuery = await submitLocalOwnerClaim(post(withoutCode, { url: `${SUBMIT}?code=${code}` }), deps());
    expect(inQuery).toEqual({ status: 400, body: { ok: false, code: "invalid_input", fields: ["code"] } });
    const inFragment = await submitLocalOwnerClaim(post(withoutCode, { url: `${SUBMIT}#${code}` }), deps());
    expect(inFragment).toEqual({ status: 400, body: { ok: false, code: "invalid_input", fields: ["code"] } });
    expect(localSetupCode.check(code)).toBe("valid");
  });

  it("refuses another site, another host name, a bad name and a weak or mismatched password, keeping the code", async () => {
    instance = await createLocalInstance("new-install");
    const { code } = localSetupCode.issue();
    const crossSite = await submitLocalOwnerClaim(post(form(code), { headers: { origin: "https://evil.example.test", "sec-fetch-site": "cross-site" } }), deps());
    expect(crossSite).toEqual({ status: 403, body: { ok: false, code: "forbidden" } });
    const rebound = await submitLocalOwnerClaim(post(form(code), { headers: { host: "rebound.example.test:3200", origin: "http://rebound.example.test:3200" } }), deps());
    expect(rebound).toEqual({ status: 403, body: { ok: false, code: "setup_on_this_computer" } });
    expect(await submitLocalOwnerClaim(post(form(code, { username: "two words" })), deps())).toEqual({ status: 400, body: { ok: false, code: "invalid_input", fields: ["username"] } });
    expect(await submitLocalOwnerClaim(post(form(code, { password: "short", confirmation: "short" })), deps())).toEqual({ status: 422, body: { ok: false, code: "weak_password", fields: ["password"] } });
    expect(await submitLocalOwnerClaim(post(form(code, { confirmation: "another dummy password" })), deps())).toEqual({ status: 400, body: { ok: false, code: "password_mismatch", fields: ["confirmation"] } });
    expect(localSetupCode.check(code)).toBe("valid");
    expect(await instance.fluxiq.programs.identityAccess.firstRun.state()).toBe("unclaimed");
  });
});
