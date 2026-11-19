import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouteRuntime, routeRequest, runtime } from "../../../../lib/workspaces/routes/tests/route-runtime";

// Pairing approval, dismissal and a browser's first project act on the
// workspace the caller works in (a panel session's workspace, or the tenant a
// paired browser's token selects), never on the primary instance.

vi.mock("../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter, isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary };
});
vi.mock("../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});
const asked = vi.hoisted(() => [] as Array<{ registry: unknown; actor: { userId: string }; domainId: string | null }>);
vi.mock("fluxiq/automation-studio", () => ({
  automationStudioPersonProject: async (input: { registry: unknown; actor: { userId: string }; domainId: string | null }) => {
    asked.push(input);
    return "project-in-this-workspace";
  }
}));

import { POST as approve } from "../approve-pairing/route";
import { POST as dismiss } from "../dismiss-pairing/route";
import { POST as firstProject } from "../first-project/route";

type Gateway = { authorizeToken: ReturnType<typeof vi.fn>; approvePairing: ReturnType<typeof vi.fn>; dismissPairing: ReturnType<typeof vi.fn> };
const gateway = (instance: { programs: { clientGateway: unknown } }) => instance.programs.clientGateway as Gateway;
let primaryGateway: Gateway;

function post(cookie: string | null, body?: unknown, bearer?: string): Request {
  const headers = routeRequest({ cookie, ...(bearer ? { bearer } : {}) }).headers;
  headers.set("content-type", "application/json");
  return new Request("https://panel.example.test/api/client-gateway/x", { method: "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(async () => {
  await resetRouteRuntime();
  asked.length = 0;
  // The primary's gateway refuses: a workspace call that reaches it fails loudly.
  primaryGateway = {
    authorizeToken: vi.fn(async () => { throw new Error("primary gateway used"); }),
    approvePairing: vi.fn(async () => { throw new Error("primary gateway used"); }),
    dismissPairing: vi.fn(() => { throw new Error("primary gateway used"); })
  };
  Object.assign(runtime.primary.programs, { clientGateway: primaryGateway });
  for (const tenant of [runtime.tenantA, runtime.tenantB]) {
    Object.assign(tenant.programs.clientGateway, { approvePairing: vi.fn(async (code: string) => ({ pairingFor: code })), dismissPairing: vi.fn(() => true) });
  }
});

describe("pairing approval and dismissal", () => {
  it("approves in the caller's own workspace as the caller, and never on the primary gateway", async () => {
    const response = await approve(post(runtime.sessions.a, { pairingCode: "123456" }));
    expect(response.status).toBe(200);
    expect(gateway(runtime.tenantA).approvePairing).toHaveBeenCalledWith("123456", { approvedByUserId: "person-a", approvedBySessionId: runtime.sessions.a });
    expect(gateway(runtime.tenantB).approvePairing).not.toHaveBeenCalled();
    expect(primaryGateway.approvePairing).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("answers another person's approval in their own workspace", async () => {
    expect((await approve(post(runtime.sessions.b, { pairingCode: "654321" }))).status).toBe(200);
    expect(gateway(runtime.tenantB).approvePairing).toHaveBeenCalledWith("654321", expect.objectContaining({ approvedByUserId: "person-b" }));
    expect(gateway(runtime.tenantA).approvePairing).not.toHaveBeenCalled();
  });

  it("says a pairing waiting only on the primary is no longer available, rather than approving it there", async () => {
    gateway(runtime.tenantA).approvePairing.mockResolvedValue(null);
    const response = await approve(post(runtime.sessions.a, { pairingCode: "000000" }));
    expect(response.status).toBe(404);
    expect(primaryGateway.approvePairing).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("dismisses on the caller's workspace gateway only, and releases it", async () => {
    expect((await dismiss(post(runtime.sessions.b, { pairingCode: "111111" }))).status).toBe(200);
    expect(gateway(runtime.tenantB).dismissPairing).toHaveBeenCalledWith("111111");
    expect(gateway(runtime.tenantA).dismissPairing).not.toHaveBeenCalled();
    expect(primaryGateway.dismissPairing).not.toHaveBeenCalled();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("refuses a caller with no session before touching any gateway", async () => {
    expect((await approve(post(null, { pairingCode: "123456" }))).status).toBe(401);
    expect((await dismiss(post(null, { pairingCode: "123456" }))).status).toBe(401);
    for (const instance of [runtime.tenantA, runtime.tenantB]) expect(gateway(instance).approvePairing).not.toHaveBeenCalled();
  });
});

describe("a browser's first project", () => {
  it("is made in the workspace its token selects, as the person who approved it, and nowhere else", async () => {
    const response = await firstProject(post(null, undefined, "browser-a-token"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { projectId: "project-in-this-workspace" } });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ registry: runtime.tenantA.programs.api, actor: { userId: "person-a" }, domainId: "domain-a" });
    expect(asked[0]!.registry).not.toBe(runtime.tenantB.programs.api);
    expect(asked[0]!.registry).not.toBe(runtime.primary.programs.api);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("makes nothing for a token that speaks for no workspace", async () => {
    expect((await firstProject(post(null, undefined, "unknown-token"))).status).toBe(401);
    expect(asked).toEqual([]);
  });
});
