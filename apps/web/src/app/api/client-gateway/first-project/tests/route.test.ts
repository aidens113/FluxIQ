import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  asked: [] as Array<Record<string, unknown>>,
  refusal: null as { error: string; status: number } | null,
  session: { sessionId: "gateway-1", operatorUserId: "user.one", metadata: { domainId: "example" } } as Record<string, unknown> | null
}));

vi.mock("fluxiq/automation-studio", () => ({
  automationStudioPersonProject: async (input: Record<string, unknown>) => {
    fixture.asked.push(input);
    return "project-own";
  }
}));
vi.mock("../../../../../lib/auth", () => ({ requireFluxIQUser: async () => null }));
vi.mock("../../../../../lib/app-route-iam", () => ({
  appRouteIamContract: () => ({}),
  authorizeAppRoute: async () => fixture.refusal,
  panelRouteActor: () => ({}),
  pairedClientRouteActor: async (_identity: unknown, session: { operatorUserId: string }) => ({ userId: session.operatorUserId, sessionId: "client-gateway:gateway-1", roleId: "operator", permissions: ["programs.read"] })
}));
vi.mock("../../../../../lib/fluxiq", () => ({
  getFluxIQWebRuntimeStatus: () => ({ automationStudio: { activeProjectId: null } }),
  getFluxIQ: () => ({
    programs: {
      api: "the registry",
      identityAccess: {},
      clientGateway: { ready: async () => undefined, authorizeToken: async () => fixture.session, snapshot: () => ({ sessions: [] }) }
    }
  })
}));

import { NextRequest } from "next/server";
import { POST } from "../route";

function ask(authorization?: string) {
  return POST(new NextRequest("http://localhost/api/client-gateway/first-project", { method: "POST", headers: authorization ? { authorization } : {} }));
}

describe("POST /api/client-gateway/first-project", () => {
  beforeEach(() => {
    fixture.asked = [];
    fixture.refusal = null;
    fixture.session = { sessionId: "gateway-1", operatorUserId: "user.one", metadata: { domainId: "example" } };
  });

  it("refuses with no credential, and with one that speaks for nobody, and makes nothing", async () => {
    expect((await ask()).status).toBe(401);
    fixture.session = null;
    expect((await ask("Bearer dummy-credential")).status).toBe(401);
    expect(fixture.asked).toEqual([]);
  });

  it("makes nothing when the route is refused", async () => {
    fixture.refusal = { error: "Not allowed", status: 403 };
    expect((await ask("Bearer dummy-credential")).status).toBe(403);
    expect(fixture.asked).toEqual([]);
  });

  it("asks through the registry, as this person, in their browser's domain, and may make one", async () => {
    const response = await ask("Bearer dummy-credential");
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { projectId: "project-own" } });
    expect(fixture.asked).toHaveLength(1);
    expect(fixture.asked[0]).toMatchObject({ registry: "the registry", actor: { userId: "user.one" }, domainId: "example", create: true });
  });
});
