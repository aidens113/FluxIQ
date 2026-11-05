import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  asked: [] as Array<Record<string, unknown>>,
  named: [] as Array<Record<string, unknown>>,
  refusal: null as { error: string; status: number } | null,
  session: { sessionId: "gateway-1", operatorUserId: "user.one", metadata: { domainId: "example" } } as Record<string, unknown> | null
}));

vi.mock("fluxiq/automation-studio", () => ({
  automationStudioPersonProject: async (input: Record<string, unknown>) => {
    fixture.asked.push(input);
    return "project-own";
  },
  automationStudioProjectName: async (input: Record<string, unknown>) => {
    fixture.named.push(input);
    return "Company website";
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
import { GET } from "../route";

function ask(authorization?: string) {
  return GET(new NextRequest("http://localhost/api/client-gateway/snapshot", { method: "GET", headers: authorization ? { authorization } : {} }));
}

describe("GET /api/client-gateway/snapshot", () => {
  beforeEach(() => {
    fixture.asked = [];
    fixture.named = [];
    fixture.refusal = null;
    fixture.session = { sessionId: "gateway-1", operatorUserId: "user.one", metadata: { domainId: "example" } };
  });

  it("names this person's own project, and being a read, never asks for one to be made", async () => {
    const response = await ask("Bearer dummy-credential");
    const body = await response.json() as { payload: { webRuntime: { automationStudio: { activeProjectId: string } } } };
    expect(body.payload.webRuntime.automationStudio.activeProjectId).toBe("project-own");
    expect(fixture.asked).toHaveLength(1);
    expect(fixture.asked[0]).toMatchObject({ registry: "the registry", actor: { userId: "user.one" }, domainId: "example" });
    expect(fixture.asked[0]?.create).toBeUndefined();
  });

  it("also says what that project is called, from the same person's view of it", async () => {
    const response = await ask("Bearer dummy-credential");
    const body = await response.json() as { payload: { webRuntime: { automationStudio: { activeProjectId: string; activeProjectName: string | null } } } };
    expect(body.payload.webRuntime.automationStudio.activeProjectName).toBe("Company website");
    expect(fixture.named[0]).toMatchObject({ registry: "the registry", actor: { userId: "user.one" }, domainId: "example", projectId: "project-own" });
  });
});
