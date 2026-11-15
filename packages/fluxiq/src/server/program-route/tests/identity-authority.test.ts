import { describe, expect, it, vi } from "vitest";
import type { FluxIQ } from "../../../framework/index.ts";
import type { ProgramApiActor } from "../../../programs/_shared/api.ts";
import { handleProgramRequest, type ProgramRouteContext, type ProgramRouteRequest } from "../handle-program-request.ts";
import type { ProgramRouteIdentityAuthority } from "../identity-authority.ts";

const COOKIE = "platform-panel-session";
const TOKEN = "tenant-client-token";
const permissions: ProgramApiActor["permissions"] = ["programs.read", "programs.write", "identity.manage"];

function authenticated(userId: string) {
  return { user: { id: userId }, role: { id: "member", permissions }, session: { expiresAtMs: Date.now() + 60_000 } };
}

function harness() {
  const platformUser = authenticated("platform-user");
  const authority: ProgramRouteIdentityAuthority = {
    validateSession: vi.fn(async (sessionId: string) => sessionId === COOKIE ? platformUser : null),
    snapshot: vi.fn(async () => ({ users: [{ id: platformUser.user.id, roleId: "member", enabled: true }], roles: [{ id: "member", permissions }] }))
  };
  // The data instance deliberately accepts a different user. No request using
  // platform authority may authenticate through this unrelated directory.
  const dataIdentity = {
    validateSession: vi.fn(async () => authenticated("data-user")),
    snapshot: vi.fn(async () => ({ users: [{ id: "data-user", roleId: "member", enabled: true }], roles: [{ id: "member", permissions }] }))
  };
  const call = vi.fn(async (_input: { actor?: ProgramApiActor; payload?: unknown; scope?: { domainId?: string | null } }) => ({ ok: true, payload: { keys: [] } }));
  const present = vi.fn(async (_input: { sessionId: string; userId: string; expiresAtMs: number }) => undefined);
  const authorizeToken = vi.fn(async (token: string) => token === TOKEN ? { sessionId: "tenant-gateway-session", operatorUserId: platformUser.user.id, metadata: { domainId: "tenant-domain" }, projectId: null } : null);
  const assertProjectDomainAccess = vi.fn(async (_projectId: string, _domainId?: string | null) => undefined);
  const fluxiq = {
    programs: {
      identityAccess: dataIdentity,
      secretKeys: { credentialUnlocks: { presentPanelSession: present } },
      clientGateway: { authorizeToken },
      automationStudio: { assertProjectDomainAccess },
      api: {
        call,
        endpoints: () => [
          { programId: "secret-keys", endpoint: "snapshot", classification: "read" },
          { programId: "automation-studio", endpoint: "get-flow-metadata-detail", classification: "read" }
        ]
      }
    }
  } as unknown as FluxIQ;
  const context: ProgramRouteContext = { fluxiq, identityAuthority: authority };
  const request = (overrides: Partial<ProgramRouteRequest> = {}): ProgramRouteRequest => ({
    method: "GET",
    url: "https://panel.example.test/api/programs/secret-keys/snapshot",
    programId: "secret-keys",
    endpoint: "snapshot",
    sessionId: COOKIE,
    authorization: null,
    readJson: vi.fn(async () => undefined),
    ...overrides
  });
  return { authority, context, request, dataIdentity, call, present, authorizeToken, assertProjectDomainAccess, platformUser };
}

describe("program request identity authority is separate from its data instance", () => {
  it("uses the platform cookie ahead of a bearer and presents it only to the selected workspace's keys", async () => {
    const h = harness();
    const result = await handleProgramRequest(h.request({ authorization: `Bearer ${TOKEN}` }), h.context);
    expect(result.status).toBe(200);
    expect(h.authority.validateSession).toHaveBeenCalledWith(COOKIE);
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: "platform-user", sessionId: COOKIE, channel: "panel" }) }));
    expect(h.present).toHaveBeenCalledWith({ sessionId: COOKIE, userId: "platform-user", expiresAtMs: h.platformUser.session.expiresAtMs });
    expect(h.authorizeToken).not.toHaveBeenCalled();
    expect(h.dataIdentity.validateSession).not.toHaveBeenCalled();
    expect(h.dataIdentity.snapshot).not.toHaveBeenCalled();
  });

  it("refuses a revoked platform cookie even if the data instance would accept it", async () => {
    const h = harness();
    vi.mocked(h.authority.validateSession).mockResolvedValue(null);
    const request = h.request({ method: "POST", readJson: vi.fn(async () => ({ actor: { userId: "administrator" }, identityAuthority: h.dataIdentity })) });
    expect((await handleProgramRequest(request, h.context)).status).toBe(401);
    expect(request.readJson).not.toHaveBeenCalled();
    expect(h.dataIdentity.validateSession).not.toHaveBeenCalled();
    expect(h.present).not.toHaveBeenCalled();
    expect(h.call).not.toHaveBeenCalled();
  });

  it("a body cannot replace the platform actor or inject another privileged auth session", async () => {
    const h = harness();
    const body = { actor: { userId: "administrator", permissions: ["identity.manage"] }, identityAuthority: { userId: "administrator" }, authSessionId: "another-session" };
    expect((await handleProgramRequest(h.request({ method: "POST", readJson: async () => body }), h.context)).status).toBe(200);
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "platform-user", sessionId: COOKIE, roleId: "member", permissions, channel: "panel" },
      payload: { ...body, authSessionId: COOKIE }
    }));
  });

  it("authorizes a bearer on the tenant gateway but resolves its owner through platform identity", async () => {
    const h = harness();
    expect((await handleProgramRequest(h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}` }), h.context)).status).toBe(200);
    expect(h.authorizeToken).toHaveBeenCalledWith(TOKEN);
    expect(h.authority.snapshot).toHaveBeenCalledOnce();
    expect(h.dataIdentity.snapshot).not.toHaveBeenCalled();
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({
      actor: { userId: "platform-user", sessionId: "client-gateway:tenant-gateway-session", roleId: "member", permissions: ["programs.read", "programs.write"], channel: "paired-client" },
      scope: { domainId: "tenant-domain" }
    }));
    expect(h.present).not.toHaveBeenCalled();
  });

  it.each(["missing", "disabled", "roleless"])("refuses a bearer whose platform owner is %s", async (state) => {
    const h = harness();
    vi.mocked(h.authority.snapshot).mockResolvedValue({
      users: state === "missing" ? [] : [{ id: "platform-user", roleId: "member", enabled: state !== "disabled" }],
      roles: state === "roleless" ? [] : [{ id: "member", permissions }]
    });
    expect((await handleProgramRequest(h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}` }), h.context)).status).toBe(401);
    expect(h.call).not.toHaveBeenCalled();
    expect(h.dataIdentity.snapshot).not.toHaveBeenCalled();
  });

  it("keeps the endpoint allowlist ahead of gateway token and platform owner lookup", async () => {
    const h = harness();
    const request = h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, endpoint: "delete-key" });
    expect((await handleProgramRequest(request, h.context)).status).toBe(403);
    expect(h.authorizeToken).not.toHaveBeenCalled();
    expect(h.authority.snapshot).not.toHaveBeenCalled();
    expect(h.call).not.toHaveBeenCalled();
  });

  it("refuses a bearer requesting another domain", async () => {
    const h = harness();
    const request = h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, url: "https://panel.example.test/api/programs/secret-keys/snapshot?domainId=another-domain" });
    expect((await handleProgramRequest(request, h.context)).status).toBe(403);
    expect(h.call).not.toHaveBeenCalled();
  });

  it("keeps project-domain checks on the selected workspace", async () => {
    const h = harness();
    h.assertProjectDomainAccess.mockRejectedValue(new Error("Project belongs to another domain"));
    const request = h.request({ method: "POST", programId: "automation-studio", endpoint: "get-flow-metadata-detail", sessionId: undefined, authorization: `Bearer ${TOKEN}`, readJson: async () => ({ projectId: "other-project", flowId: "flow" }) });
    const result = await handleProgramRequest(request, h.context);
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body).errorCode).toBe("authorization.project_domain");
    expect(h.assertProjectDomainAccess).toHaveBeenCalledWith("other-project", "tenant-domain");
    expect(h.call).not.toHaveBeenCalled();
  });

  it("propagates authority failures without authenticating through tenant identity", async () => {
    const h = harness();
    vi.mocked(h.authority.validateSession).mockRejectedValue(new Error("Identity unavailable"));
    await expect(handleProgramRequest(h.request(), h.context)).rejects.toThrow("Identity unavailable");
    expect(h.dataIdentity.validateSession).not.toHaveBeenCalled();
    expect(h.present).not.toHaveBeenCalled();
    expect(h.call).not.toHaveBeenCalled();
  });

  it("preserves single-instance behavior when no authority port is supplied", async () => {
    const h = harness();
    expect((await handleProgramRequest(h.request(), { fluxiq: h.context.fluxiq })).status).toBe(200);
    expect(h.dataIdentity.validateSession).toHaveBeenCalledWith(COOKIE);
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: "data-user" }) }));
    expect(h.authority.validateSession).not.toHaveBeenCalled();
  });
});
