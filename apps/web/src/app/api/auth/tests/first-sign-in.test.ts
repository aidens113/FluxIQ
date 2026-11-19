import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxIQ } from "fluxiq";

// First sign-in end to end over a real FluxIQ instance in a temporary root, on
// the local profile, where identity access creates the default `admin` account
// with the temporary password `admin` exactly as on a first start. The routes
// are the real route handlers; only Next's cookie store and the web runtime's
// lookup are replaced, so each answer says how the route itself decided. Every
// password here is a dummy value.

const jar = vi.hoisted(() => new Map<string, string>());
const runtime = vi.hoisted(() => ({ fluxiq: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    has: (name: string) => jar.has(name),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  }),
  headers: async () => new Headers(),
}));

vi.mock("../../../../lib/fluxiq", () => {
  const instance = () => runtime.fluxiq as FluxIQ;
  const lease = () => ({ workspaceId: "workspace-main", fluxiq: instance(), release: () => undefined });
  return {
    getFluxIQ: instance,
    getFluxIQAfterReload: async () => instance(),
    isCurrentFluxIQPrimary: () => true,
    getFluxIQWebRuntimeStatus: () => {
      throw new Error("not used by a refused call");
    },
    getFluxIQWorkspaces: () => ({
      tenancy: "single",
      primaryWorkspaceId: "workspace-main",
      primary: () => ({ fluxiq: instance() }),
      acquire: async () => lease(),
    }),
  };
});

const TEMPORARY = { username: "admin", password: "admin" };
const NEW_PASSWORD = "a dummy replacement password";
const ORIGIN = "http://127.0.0.1:3200";
const SESSION_COOKIE = "fluxiq_session";
const SETUP_COOKIE = "fluxiq_credential_setup";
const PENDING_COOKIE = "fluxiq_credential_setup_pending";

let root: string;
let fluxiq: FluxIQ;
/** The browser's cookies right after the temporary sign-in; later cases start from them, as a reload would. */
let setupJar = new Map<string, string>();

function restore(cookies: Map<string, string>): void {
  jar.clear();
  for (const [name, value] of cookies) jar.set(name, value);
}

beforeAll(async () => {
  delete process.env.FLUXIQ_PROFILE;
  delete process.env.FLUXIQ_PUBLIC_ORIGIN;
  delete process.env.FLUXIQ_TRUST_PROXY;
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-first-sign-in-"));
  fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  await fluxiq.setup();
  runtime.fluxiq = fluxiq;
}, 120_000);

afterAll(async () => {
  // Closed as the web runtime closes (`closeFluxIQWebRuntime` in lib/fluxiq): the instance, then the
  // host-owned platform services its routes composed. `GET /api/keys` composes them (key sessions ask
  // the platform store whether the person is eligible), and with them the IAM audit store, whose
  // connection stays open until `closePlatformServices`. Left open, its SQLite files cannot be removed
  // on Windows and the root's removal below never returns (t955; reached since t928 let the local
  // profile derive its instance id, so the keys route composes instead of failing its configuration).
  try {
    await fluxiq?.close();
  } finally {
    if (fluxiq) await (await import("../../../../server/provisioning-listener")).closePlatformServices(fluxiq);
  }
  if (root && path.basename(root).startsWith("fluxiq-first-sign-in-")) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

beforeEach(() => {
  jar.clear();
});

/** A same-origin browser request from the panel at 127.0.0.1, carrying the jar's cookies. */
function browserRequest(pathname: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const headers: Record<string, string> = {
    host: "127.0.0.1:3200",
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    ...(cookie ? { cookie } : {}),
    ...init.headers,
  };
  return new Request(`${ORIGIN}${pathname}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    ...(init.body === undefined ? {} : { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) }),
  });
}

/** Applies a response's Set-Cookie headers to the jar, as a browser would. */
function keepCookies(response: Response): void {
  for (const line of response.headers.getSetCookie()) {
    const [pair = "", ...attributes] = line.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/iu.test(attribute)) || value === "";
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
}

async function signIn(username: string, password: string, headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("../login/route");
  const response = await POST(browserRequest("/api/auth/login", { body: { username, password }, headers }));
  keepCookies(response);
  return response;
}

async function adminSessions(): Promise<number> {
  return (await fluxiq.programs.identityAccess.snapshot()).sessions.filter((session) => session.userId === "admin").length;
}

/** Every route a setup-only browser must not reach: pairing approval, model keys, project and identity data, the old password route. */
async function probeOtherRoutes(): Promise<Record<string, number>> {
  const approve = await import("../../client-gateway/approve-pairing/route");
  const keys = await import("../../keys/route");
  const programs = await import("../../programs/[programId]/[endpoint]/route");
  const snapshot = await import("../../client-gateway/snapshot/route");
  const program = (programId: string, endpoint: string) => ({ params: Promise.resolve({ programId, endpoint }) });
  return {
    approvePairing: (await approve.POST(browserRequest("/api/client-gateway/approve-pairing", { body: { pairingCode: "dummy-pairing-code" } }))).status,
    listKeys: (await keys.GET(browserRequest("/api/keys"))).status,
    gatewaySnapshot: (await snapshot.GET(browserRequest("/api/client-gateway/snapshot"))).status,
    identitySnapshot: (await programs.GET(browserRequest("/api/programs/identity-access/snapshot"), program("identity-access", "snapshot"))).status,
    listProjects: (await programs.GET(browserRequest("/api/programs/automation-studio/projects"), program("automation-studio", "projects"))).status,
    setPassword: (await programs.POST(browserRequest("/api/programs/identity-access/set-password", { body: { userId: "admin", value: NEW_PASSWORD, authorizationPassword: TEMPORARY.password } }), program("identity-access", "set-password"))).status,
  };
}

const REFUSED = { approvePairing: 401, listKeys: 401, gatewaySnapshot: 401, identitySnapshot: 401, listProjects: 401, setPassword: 401 };

// The cases run in order and share the instance: each starts where the previous one left the browser.
describe("first sign-in with the temporary credential", { timeout: 120_000 }, () => {
  it("refuses a cross-site sign-in before it authenticates", async () => {
    const before = await adminSessions();
    // A page on another site posting a text/plain form (no preflight) whose body is JSON.
    const fromForm = await signIn(TEMPORARY.username, TEMPORARY.password, { origin: "https://evil.example.test", "sec-fetch-site": "cross-site", "content-type": "text/plain" });
    expect(fromForm.status).toBe(403);
    await expect(fromForm.json()).resolves.toMatchObject({ ok: false, code: "cross_site_request" });
    // An older browser that sends only Origin.
    const originOnly = await signIn(TEMPORARY.username, TEMPORARY.password, { origin: "https://evil.example.test", "sec-fetch-site": "" });
    expect(originOnly.status).toBe(403);
    // A rebound DNS name pointing at 127.0.0.1: same "origin" to the browser, but not this computer's address.
    const rebound = await signIn(TEMPORARY.username, TEMPORARY.password, { host: "rebound.example.test:3200", origin: "http://rebound.example.test:3200" });
    expect(rebound.status).toBe(403);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(jar.has(SETUP_COOKIE)).toBe(false);
    expect(await adminSessions()).toBe(before);
  });

  it("signing in with the temporary credential gives only a setup session", async () => {
    const signedIn = await signIn(TEMPORARY.username, TEMPORARY.password);
    setupJar = new Map(jar);
    expect(signedIn.status).toBe(200);
    await expect(signedIn.json()).resolves.toMatchObject({ ok: true, payload: { requiresCredentialSetup: true } });
    // No panel session exists for the temporary credential: none in the browser, none in identity access.
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(jar.get(SETUP_COOKIE)).toMatch(/^[\w-]{40,}$/u);
    expect(jar.get(PENDING_COOKIE)).toBe("1");
    expect(await adminSessions()).toBe(0);
    expect(await fluxiq.programs.identityAccess.validateSession(jar.get(SETUP_COOKIE))).toBeNull();
  });

  it("refuses that setup session on other routes and on the gateway's pairing approval, after a reload too", async () => {
    restore(setupJar);
    // The setup cookie opens nothing, alone or presented as the session cookie.
    expect(await probeOtherRoutes()).toEqual(REFUSED);
    const setupToken = jar.get(SETUP_COOKIE) ?? "dummy-missing-token";
    jar.set(SESSION_COOKIE, setupToken);
    expect(await probeOtherRoutes()).toEqual(REFUSED);
    expect(await adminSessions()).toBe(0);
  });

  it("replacing the password gives the same person a full session at once", async () => {
    restore(setupJar);
    // Reloading or leaving changes nothing: the setup cookie is all the browser holds, and it still finishes setup.
    const { POST: completeSetup } = await import("../credential-setup/route");
    const weak = await completeSetup(browserRequest("/api/auth/credential-setup", { body: { password: "short", confirmation: "short" } }));
    expect(weak.status).toBe(400);
    const crossSite = await completeSetup(browserRequest("/api/auth/credential-setup", { body: { password: NEW_PASSWORD, confirmation: NEW_PASSWORD }, headers: { origin: "https://evil.example.test", "sec-fetch-site": "cross-site" } }));
    expect(crossSite.status).toBe(403);

    const setupToken = jar.get(SETUP_COOKIE) ?? "";
    const replaced = await completeSetup(browserRequest("/api/auth/credential-setup", { body: { password: NEW_PASSWORD, confirmation: NEW_PASSWORD } }));
    keepCookies(replaced);
    expect(replaced.status).toBe(200);
    await expect(replaced.json()).resolves.toMatchObject({ ok: true, payload: { user: { id: "admin" } } });
    expect(jar.has(SETUP_COOKIE)).toBe(false);
    expect(jar.has(PENDING_COOKIE)).toBe(false);
    const sessionId = jar.get(SESSION_COOKIE) ?? "";
    expect((await fluxiq.programs.identityAccess.validateSession(sessionId))?.user.id).toBe("admin");
    expect(await adminSessions()).toBe(1);

    // The same person now has a normal session: the pairing approval reaches the gateway (which has no such request).
    const approve = await import("../../client-gateway/approve-pairing/route");
    expect((await approve.POST(browserRequest("/api/client-gateway/approve-pairing", { body: { pairingCode: "dummy-pairing-code" } }))).status).toBe(404);
    // The model keys route now admits the caller (this test composes no key service, so it answers past the sign-in check).
    expect((await (await import("../../keys/route")).GET(browserRequest("/api/keys"))).status).not.toBe(401);

    // The temporary credential is gone; the spent setup cookie finishes nothing.
    await expect(fluxiq.programs.identityAccess.authenticate({ ...TEMPORARY })).rejects.toThrow();
    jar.clear();
    jar.set(SETUP_COOKIE, setupToken);
    const replayed = await completeSetup(browserRequest("/api/auth/credential-setup", { body: { password: "another dummy password", confirmation: "another dummy password" } }));
    expect(replayed.status).toBe(401);
    jar.clear();

    // Signing in with the new password is an ordinary sign-in.
    const again = await signIn(TEMPORARY.username, NEW_PASSWORD);
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toMatchObject({ ok: true, payload: { requiresCredentialSetup: false } });
    expect(jar.get(SESSION_COOKIE)).toBeTruthy();
  });
});
