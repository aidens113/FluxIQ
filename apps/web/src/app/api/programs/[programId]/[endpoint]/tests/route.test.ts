import { AUTOMATION_STUDIO_ENDPOINTS } from "fluxiq/automation-studio";
import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
const validateSession = vi.fn();
const snapshot = vi.fn();
const authorizeToken = vi.fn();
const endpoints = vi.fn();
let cookieValue: string | undefined = "authenticated-session";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => (cookieValue === undefined ? undefined : { value: cookieValue })),
  })),
}));

vi.mock("../../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      api: { call, endpoints },
      identityAccess: { validateSession, snapshot },
      clientGateway: { authorizeToken },
    },
  }),
  getFluxIQWebRuntimeStatus: vi.fn(),
}));

import { GET, POST } from "../route";

const TOKEN = "pairing-token-secret-value";

const ALLOWLISTED = [
  "list-conversations",
  "open-conversation",
  "get-conversation",
  "append-turn",
  "answer-ask",
  "list-runtime-sessions",
  "cancel-runtime-session",
];

const CLASSIFICATIONS: Record<string, string> = {
  "list-conversations": "read",
  "open-conversation": "authoring",
  "get-conversation": "read",
  "append-turn": "authoring",
  "answer-ask": "authoring",
  "list-runtime-sessions": "read",
  "cancel-runtime-session": "authoring",
};

function params(endpoint: string, programId = "automation-studio") {
  return { params: Promise.resolve({ programId, endpoint }) };
}

function tokenRequest(endpoint: string, init: { body?: unknown; domainId?: string } = {}) {
  const query = init.domainId === undefined ? "" : `?domainId=${init.domainId}`;
  return new Request(`http://127.0.0.1/api/programs/automation-studio/${endpoint}${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function resetMocks() {
  call.mockReset();
  validateSession.mockReset();
  snapshot.mockReset();
  authorizeToken.mockReset();
  endpoints.mockReset();
}

describe("program endpoint route", () => {
  beforeEach(() => {
    resetMocks();
    cookieValue = "authenticated-session";
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
      params("get-flow-bootstrap-generation-readiness"),
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

  it("still injects the signed-in person's auth session, and ignores a bearer header beside a valid cookie", async () => {
    call.mockResolvedValue({ ok: true, payload: {} });

    await POST(tokenRequest("delete-run-datasets", { body: { projectId: "p", authSessionId: "spoofed" } }), params("delete-run-datasets"));

    expect(authorizeToken).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ payload: { projectId: "p", authSessionId: "authenticated-session" } }));
  });
});

describe("a paired client's bearer token", () => {
  beforeEach(() => {
    resetMocks();
    cookieValue = undefined;
    validateSession.mockResolvedValue(null);
    authorizeToken.mockResolvedValue({ sessionId: "gateway-session-1", operatorUserId: "user:owner", metadata: { domainId: "web-automation" } });
    snapshot.mockResolvedValue({
      users: [
        { id: "user:owner", roleId: "role:admin", enabled: true },
        { id: "user:disabled", roleId: "role:admin", enabled: false },
      ],
      roles: [
        {
          id: "role:admin",
          permissions: ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage"],
        },
      ],
    });
    endpoints.mockReturnValue(
      Object.values(AUTOMATION_STUDIO_ENDPOINTS).map((endpoint) => ({
        programId: "automation-studio",
        endpoint,
        permission: "programs.read",
        classification: CLASSIFICATIONS[endpoint] ?? "destructive",
      })),
    );
    call.mockResolvedValue({ ok: true, payload: { conversation: { id: "c1" } } });
  });

  it.each(ALLOWLISTED)("reaches %s as the person who approved the pairing, in the session's own domain", async (endpoint) => {
    const response = await POST(tokenRequest(endpoint, { body: { projectId: "project-1" } }), params(endpoint));

    expect(response.status).toBe(200);
    expect(authorizeToken).toHaveBeenCalledWith(TOKEN);
    expect(call).toHaveBeenCalledWith({
      programId: "automation-studio",
      endpoint,
      scope: { domainId: "web-automation" },
      actor: {
        sessionId: "client-gateway:gateway-session-1",
        userId: "user:owner",
        roleId: "role:admin",
        permissions: ["programs.read", "programs.write", "runtime.control"],
      },
      payload: { projectId: "project-1" },
    });
    expect(await response.json()).toEqual({ ok: true, payload: { conversation: { id: "c1" } } });
  });

  it("is refused on every other Automation Studio endpoint, by GET and POST, without the token being looked up", async () => {
    const others = Object.values(AUTOMATION_STUDIO_ENDPOINTS).filter((endpoint) => !ALLOWLISTED.includes(endpoint));
    expect(others.length).toBeGreaterThan(100);
    for (const endpoint of others) {
      for (const handler of [GET, POST]) {
        const response = await handler(tokenRequest(endpoint, { body: { projectId: "project-1" } }), params(endpoint));
        expect({ endpoint, status: response.status }).toEqual({ endpoint, status: 403 });
      }
    }
    expect(authorizeToken).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("is refused on every other program's endpoints", async () => {
    for (const [programId, endpoint] of [
      ["identity-access", "list-users"],
      ["secret-keys", "list-secrets"],
      ["database-manager", "query"],
      ["background-tasks", "list-tasks"],
    ] as const) {
      const response = await POST(tokenRequest(endpoint, { body: {} }), params(endpoint, programId));
      expect(response.status).toBe(403);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("cannot reach an allowlisted endpoint the registry classifies as destructive, program-gated or unknown", async () => {
    for (const classification of ["destructive", "program-gated", "destructive-ungated", undefined]) {
      endpoints.mockReturnValue(
        classification === undefined ? [] : [{ programId: "automation-studio", endpoint: "answer-ask", permission: "programs.write", classification }],
      );
      const response = await POST(tokenRequest("answer-ask", { body: { askId: "a" } }), params("answer-ask"));
      expect({ classification, status: response.status }).toEqual({ classification, status: 403 });
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("never carries an auth session into the payload, even one the caller names", async () => {
    await POST(tokenRequest("answer-ask", { body: { askId: "ask-1", kind: "approve", authSessionId: "stolen-session" } }), params("answer-ask"));

    expect(call).toHaveBeenCalledWith(expect.objectContaining({ payload: { askId: "ask-1", kind: "approve" } }));
  });

  it("is refused when the token speaks for no ready session", async () => {
    authorizeToken.mockResolvedValue(null);
    const response = await POST(tokenRequest("get-conversation", { body: {} }), params("get-conversation"));

    expect(response.status).toBe(401);
    expect(call).not.toHaveBeenCalled();
  });

  it("is refused when the person who approved the pairing is disabled or gone", async () => {
    for (const operatorUserId of ["user:disabled", "user:missing", undefined]) {
      authorizeToken.mockResolvedValue({ sessionId: "gateway-session-1", operatorUserId, metadata: { domainId: "web-automation" } });
      const response = await POST(tokenRequest("get-conversation", { body: {} }), params("get-conversation"));
      expect(response.status).toBe(401);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("is refused when the URL names a domain other than the one the session declared", async () => {
    const response = await POST(tokenRequest("list-conversations", { body: {}, domainId: "desktop-automation" }), params("list-conversations"));

    expect(response.status).toBe(403);
    expect(call).not.toHaveBeenCalled();
  });

  it("accepts the URL naming the session's own domain", async () => {
    const response = await POST(tokenRequest("list-conversations", { body: {}, domainId: "web-automation" }), params("list-conversations"));

    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ scope: { domainId: "web-automation" } }));
  });

  it("is refused without a bearer header or cookie", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/programs/automation-studio/get-conversation", { method: "POST", body: "{}" }),
      params("get-conversation"),
    );

    expect(response.status).toBe(401);
    expect(authorizeToken).not.toHaveBeenCalled();
  });

  it("never echoes the token in any answer, allowed or refused, nor passes it to a handler", async () => {
    const bodies: string[] = [];
    bodies.push(await (await POST(tokenRequest("get-conversation", { body: {} }), params("get-conversation"))).text());
    bodies.push(await (await POST(tokenRequest("delete-run-datasets", { body: {} }), params("delete-run-datasets"))).text());
    authorizeToken.mockResolvedValue(null);
    bodies.push(await (await POST(tokenRequest("get-conversation", { body: {} }), params("get-conversation"))).text());

    for (const body of bodies) expect(body).not.toContain(TOKEN);
    expect(JSON.stringify(call.mock.calls)).not.toContain(TOKEN);
  });
});
