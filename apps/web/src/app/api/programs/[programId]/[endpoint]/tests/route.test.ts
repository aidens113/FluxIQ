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
  "get-runtime-build-identity",
    "list-conversations",
  "open-conversation",
  "get-conversation",
  "append-turn",
  "answer-ask",
  "list-runtime-sessions",
  "cancel-runtime-session",
  "list-flow-summaries",
  "list-flow-runs",
  "get-flow-run-detail",
  "list-flow-adaptations",
  "export-run-dataset",
  "run-runtime-session",
  "generate-recording-proposal",
  "review-recording-flow-proposal",
  "remove-recording-entry",
];

const CLASSIFICATIONS: Record<string, string> = {
  "get-runtime-build-identity": "read",
  "list-conversations": "read",
  "open-conversation": "authoring",
  "get-conversation": "read",
  "append-turn": "authoring",
  "answer-ask": "authoring",
  "list-runtime-sessions": "read",
  "cancel-runtime-session": "authoring",
  "list-flow-summaries": "read",
  "list-flow-runs": "read",
  "get-flow-run-detail": "read",
  "list-flow-adaptations": "read",
  "export-run-dataset": "read",
  "run-runtime-session": "authoring",
  "generate-recording-proposal": "authoring",
  "review-recording-flow-proposal": "authoring",
  "remove-recording-entry": "authoring",
};

/** A run by token with no mode is pinned to no LLM intervention; every other body passes as sent. */
function forwardedPayload(endpoint: string, body: Record<string, unknown>) {
  return endpoint === "run-runtime-session" ? { ...body, adaptiveMode: "no_llm_intervention" } : body;
}

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
    // Every allowlisted endpoint is registered, whether or not the built
    // `fluxiq` package the endpoint list is read from has caught up with it.
    endpoints.mockReturnValue(
      [...new Set([...Object.values(AUTOMATION_STUDIO_ENDPOINTS), ...ALLOWLISTED])].map((endpoint) => ({
        programId: "automation-studio",
        endpoint,
        permission: "programs.read",
        classification: CLASSIFICATIONS[endpoint] ?? "destructive",
      })),
    );
    call.mockResolvedValue({ ok: true, payload: { conversation: { id: "c1" } } });
  });

  it.each(ALLOWLISTED)("reaches %s as the person who approved the pairing, in the session's own domain", async (endpoint) => {
    const body = { projectId: "project-1", flowId: "flow-1" };
    const response = await POST(tokenRequest(endpoint, { body }), params(endpoint));

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
        permissions: ["programs.read", "programs.write", "flows.write", "runtime.control"],
      },
      payload: forwardedPayload(endpoint, body),
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

  it("refuses a run body that would reach an LLM, naming the field and never its value, before any handler runs", async () => {
    const response = await POST(tokenRequest("run-runtime-session", { body: { projectId: "p", flowId: "f", runIntent: "run-intent:do-not-echo" } }), params("run-runtime-session"));

    expect(response.status).toBe(403);
    const answer = await response.text();
    expect(JSON.parse(answer)).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may carry only the explore_and_adapt intent." });
    expect(answer).not.toContain("do-not-echo");
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses a run by GET, which names no saved Flow", async () => {
    const response = await GET(new Request("http://127.0.0.1/api/programs/automation-studio/run-runtime-session", { headers: { authorization: `Bearer ${TOKEN}` } }), params("run-runtime-session"));

    expect(response.status).toBe(403);
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses an LLM-assisted proposal and a rejecting review", async () => {
    const proposal = await POST(tokenRequest("generate-recording-proposal", { body: { projectId: "p", recordingId: "r", mode: "llm_assisted" } }), params("generate-recording-proposal"));
    const review = await POST(tokenRequest("review-recording-flow-proposal", { body: { projectId: "p", proposalId: "x", decision: "rejected" } }), params("review-recording-flow-proposal"));

    expect([proposal.status, review.status]).toEqual([403, 403]);
    expect(call).not.toHaveBeenCalled();
  });

  it("does not narrow a signed-in person's run", async () => {
    cookieValue = "authenticated-session";
    validateSession.mockResolvedValue({ user: { id: "user:test" }, role: { id: "role:test", permissions: ["runtime.control"] } });
    const response = await POST(tokenRequest("run-runtime-session", { body: { projectId: "p", flowId: "f", adaptiveMode: "fully_adaptive" } }), params("run-runtime-session"));

    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ payload: { projectId: "p", flowId: "f", adaptiveMode: "fully_adaptive", authSessionId: "authenticated-session" } }));
  });

  it("answers the secret-keys snapshot with kind, provider and enabled only", async () => {
    endpoints.mockReturnValue([{ programId: "secret-keys", endpoint: "snapshot", permission: "programs.read", classification: "read" }]);
    call.mockResolvedValue({
      ok: true,
      payload: { keys: [{ id: "secret:1", name: "Work OpenAI", kind: "llm", provider: "openai", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { hint: "sk-...9" } }] },
    });

    const response = await GET(new Request("http://127.0.0.1/api/programs/secret-keys/snapshot", { headers: { authorization: `Bearer ${TOKEN}` } }), params("snapshot", "secret-keys"));

    expect(response.status).toBe(200);
    const answer = await response.text();
    expect(JSON.parse(answer)).toEqual({ ok: true, payload: { keys: [{ kind: "llm", provider: "openai", enabled: true }] } });
    for (const leaked of ["secret:1", "Work OpenAI", "sk-...9"]) expect(answer).not.toContain(leaked);
  });
});
