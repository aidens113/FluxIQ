import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  asked: [] as Array<Record<string, unknown>>,
  refusal: null as { ok: false; error: string; status: number } | null,
  released: 0,
  binding: { channel: "paired-client", domainId: "example" } as Record<string, unknown>
}));

vi.mock("fluxiq/automation-studio", () => ({
  automationStudioPersonProject: async (input: Record<string, unknown>) => {
    fixture.asked.push(input);
    return "project-own";
  }
}));
vi.mock("../../../../../lib/workspaces/routes", () => ({
  workspaceRouteContext: async () => fixture.refusal ?? { ok: true, context: {
    fluxiq: { programs: { api: "the registry" } },
    caller: { actor: { userId: "user.one", sessionId: "client-gateway:gateway-1" } },
    binding: fixture.binding,
    release: () => { fixture.released += 1; }
  } }
}));

import { NextRequest } from "next/server";
import { POST } from "../route";

function ask(authorization?: string, query = "") {
  return POST(new NextRequest(`http://localhost/api/client-gateway/first-project${query}`, { method: "POST", headers: authorization ? { authorization } : {} }));
}

describe("POST /api/client-gateway/first-project", () => {
  beforeEach(() => {
    fixture.asked = [];
    fixture.refusal = null;
    fixture.released = 0;
    fixture.binding = { channel: "paired-client", domainId: "example" };
  });

  it("makes nothing for a caller the workspace route does not admit", async () => {
    fixture.refusal = { ok: false, error: "Authentication required", status: 401 };
    expect((await ask()).status).toBe(401);
    fixture.refusal = { ok: false, error: "Not allowed", status: 403 };
    expect((await ask("Bearer dummy-credential")).status).toBe(403);
    expect(fixture.asked).toEqual([]);
  });

  it("asks through the held workspace's registry, as this person, in their browser's domain, and releases it", async () => {
    const response = await ask("Bearer dummy-credential");
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { projectId: "project-own" } });
    expect(fixture.asked).toHaveLength(1);
    expect(fixture.asked[0]).toMatchObject({ registry: "the registry", actor: { userId: "user.one" }, domainId: "example", create: true });
    expect(fixture.released).toBe(1);
  });
  it("answers the panel's chat too, in the domain its page is scoped to, or unscoped as the panel lists projects", async () => {
    fixture.binding = { channel: "panel" };
    await expect((await ask(undefined, "?domainId=shop")).json()).resolves.toEqual({ ok: true, payload: { projectId: "project-own" } });
    await ask();
    expect(fixture.asked.map((input) => [input.domainId, input.unscoped, input.create])).toEqual([["shop", true, true], [null, true, true]]);
    expect(fixture.released).toBe(2);
  });

  it("never asks unscoped for a browser paired without a domain", async () => {
    fixture.binding = { channel: "paired-client", domainId: null };
    await ask("Bearer dummy-credential");
    expect(fixture.asked[0]).toMatchObject({ domainId: null });
    expect(fixture.asked[0]).not.toHaveProperty("unscoped");
  });
});
