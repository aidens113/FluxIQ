import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
const validateSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => ({ value: "authenticated-session" })),
  })),
}));

vi.mock("../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      api: { call },
      identityAccess: { validateSession },
    },
  }),
  getFluxIQWebRuntimeStatus: vi.fn(),
}));

import { GET } from "./route";

describe("program endpoint route", () => {
  beforeEach(() => {
    call.mockReset();
    validateSession.mockReset();
    validateSession.mockResolvedValue({
      user: { id: "user:test" },
      role: { id: "role:test", permissions: ["programs.read"] },
    });
  });

  it("dispatches the provider-free bootstrap readiness endpoint through authenticated GET without an injected payload", async () => {
    call.mockResolvedValue({ ok: true, payload: { readiness: { supported: true } } });

    const response = await GET(
      new Request(
        "http://127.0.0.1/api/programs/automation-studio/get-flow-bootstrap-generation-readiness?domainId=web-automation",
      ),
      {
        params: Promise.resolve({
          programId: "automation-studio",
          endpoint: "get-flow-bootstrap-generation-readiness",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledWith({
      programId: "automation-studio",
      endpoint: "get-flow-bootstrap-generation-readiness",
      scope: { domainId: "web-automation" },
      actor: {
        sessionId: "authenticated-session",
        userId: "user:test",
        roleId: "role:test",
        permissions: ["programs.read"],
      },
    });
    expect(await response.json()).toEqual({ ok: true, payload: { readiness: { supported: true } } });
  });
});