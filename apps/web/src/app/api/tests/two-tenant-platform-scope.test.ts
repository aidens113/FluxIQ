import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./two-tenant-runtime")).nextHeadersMock());
vi.mock("../../../lib/fluxiq", async () => (await import("./two-tenant-runtime")).fluxiqModuleMock());
vi.mock("../../../server/provisioning-listener", async () => (await import("./two-tenant-runtime")).provisioningListenerMock());
vi.mock("../../../server/browser-trust", () => ({ resolveServiceClientHttpRoute: async () => null }));
const presented = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("fluxiq/server", async (original) => ({ ...(await original<typeof import("fluxiq/server")>()), presentPanelSession: presented }));

import { currentFluxIQUser } from "../../../lib/auth";
import { FLUXIQ_SESSION_COOKIE } from "../../../lib/session-cookie";
import { POST as welcomeSubmit } from "../../welcome/submit/route";
import { GET as readSetup, POST as runSetup } from "../framework/setup/route";
import { POST as logout } from "../auth/logout/route";
import { asPerson, outstandingLeases, resetTwoTenants, TENANT_A, twoTenants } from "./two-tenant-runtime";

// The platform-scope routes (welcome, logout, `lib/auth`) and the
// operator-only framework setup on the hosted `service` profile with two
// tenant workspaces: identity is the platform's, keys are restored in the
// session's own workspace, and nothing here asks the primary instance for
// workspace data.

const ORIGIN = "https://panel.example.test";
const PASSWORD = "a dummy fixture password";

beforeEach(async () => {
  await resetTwoTenants();
  presented.mockClear();
});

afterEach(() => {
  expect(outstandingLeases()).toBe(0);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type TenantKeys = { unlockSession: ReturnType<typeof vi.fn> };
const tenantKeys = () => twoTenants.instances.get(TENANT_A)!.programs.secretKeys as TenantKeys;

let invitations = 0;

async function invited(email: string): Promise<{ userId: string; token: string }> {
  const answer = await twoTenants.services.provisioning.run("createAccount", {
    requestId: `welcome-invite-${(invitations += 1)}`, email, displayName: email, policies: ["FluxIQUserAccess"], workspace: TENANT_A, sendWelcome: true
  }, { kind: "in-process", actorUserId: null, transport: "in-process" });
  if (!answer.ok || answer.result.status !== "created") throw new Error(`fixture invitee was not created: ${answer.ok ? answer.result.status : answer.error.code}`);
  const message = [...twoTenants.email.messages].reverse().find((candidate) => candidate.variables.welcomeUrl !== undefined);
  return { userId: answer.result.userId, token: new URL(message!.variables.welcomeUrl!).hash.replace(/^#token=/u, "") };
}

function post(body: unknown): Request {
  return new Request(`${ORIGIN}/welcome/submit`, { method: "POST", headers: { "content-type": "application/json", host: new URL(ORIGIN).host }, body: JSON.stringify(body) });
}

function sessionCookieOf(response: Response): string | null {
  const header = response.headers.get("set-cookie") ?? "";
  return new RegExp(`${FLUXIQ_SESSION_COOKIE}=([^;]+)`, "u").exec(header)?.[1] ?? null;
}

describe("currentFluxIQUser", () => {
  it("validates on the platform identity and never touches the primary's secret keys under multi tenancy", async () => {
    const { adminA } = twoTenants.people;
    asPerson(adminA, `${ORIGIN}/x`);
    const auth = await currentFluxIQUser();
    expect(auth?.user.id).toBe(adminA.userId);
    expect(twoTenants.primaryTouched).toEqual([]);
    expect(presented).not.toHaveBeenCalled();
  });

  it("presents the stored credentials once under single tenancy, where the primary is the workspace", async () => {
    twoTenants.manager.tenancy = "single";
    const { adminA } = twoTenants.people;
    asPerson(adminA, `${ORIGIN}/x`);
    await currentFluxIQUser();
    expect(presented).toHaveBeenCalledTimes(1);
    expect(presented).toHaveBeenCalledWith(twoTenants.primary, adminA.sessionId, expect.objectContaining({ user: expect.objectContaining({ id: adminA.userId }) }));
  });
});

describe("welcome sign-in", () => {
  it("restores keys in the session's own workspace and never calls the primary's secret keys", async () => {
    const { userId, token } = await invited("welcome-a@example.test");
    const response = await welcomeSubmit(post({ token, password: PASSWORD }));
    expect(response.status).toBe(200);
    const session = sessionCookieOf(response);
    expect(session).toBeTruthy();
    expect(tenantKeys().unlockSession).toHaveBeenCalledWith({ sessionId: session, userId, authorizationPassword: PASSWORD, expiresAtMs: expect.any(Number), passwordVerified: true });
    expect(twoTenants.primaryTouched).toEqual([]);
  });

  it("signs the person in even when the key restore throws, with the session kept", async () => {
    const { userId, token } = await invited("welcome-b@example.test");
    tenantKeys().unlockSession.mockRejectedValue(new Error("restore failed"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await welcomeSubmit(post({ token, password: PASSWORD }));
    expect(response.status).toBe(200);
    const session = sessionCookieOf(response);
    expect(session).toBeTruthy();
    expect((await twoTenants.identity.validateSession(session!))?.user.id).toBe(userId);
    expect(twoTenants.primaryTouched).toEqual([]);
  });

  it("ignores a posted answer shape: no session is set from a body the poster wrote", async () => {
    const response = await welcomeSubmit(post({ status: 200, body: { ok: true }, session: { id: "a-session-the-poster-chose", ttlMs: 1000 } }));
    expect(response.status).toBe(400);
    expect(sessionCookieOf(response)).toBeNull();
  });
});

describe("logout", () => {
  it("revokes the session on the platform identity without asking the primary for workspace data", async () => {
    const { adminA } = twoTenants.people;
    asPerson(adminA, `${ORIGIN}/api/auth/logout`);
    expect((await logout()).status).toBe(200);
    expect(await twoTenants.identity.validateSession(adminA.sessionId)).toBeNull();
    expect(twoTenants.primaryTouched).toEqual([]);
  });
});

describe("framework setup under multi tenancy", () => {
  it("refuses a read as operator-only before touching any instance", async () => {
    const { adminA } = twoTenants.people;
    const response = await readSetup(asPerson(adminA, `${ORIGIN}/api/framework/setup`));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "operator_only" });
    expect(twoTenants.acquired).toEqual([]);
  });

  it("refuses setup, migrate and rollback without reading the body and without a reload", async () => {
    const { adminA } = twoTenants.people;
    for (const action of ["setup", "migrate", "rollback-migration"]) {
      const request = asPerson(adminA, `${ORIGIN}/api/framework/setup`, { action });
      const response = await runSetup(request);
      expect(response.status).toBe(403);
      expect(request.bodyUsed).toBe(false);
    }
    expect(twoTenants.reload).not.toHaveBeenCalled();
    expect(twoTenants.acquired).toEqual([]);
    expect(twoTenants.primaryTouched).toEqual([]);
  });
});
