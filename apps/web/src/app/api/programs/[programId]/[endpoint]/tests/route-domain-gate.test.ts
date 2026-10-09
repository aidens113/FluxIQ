// The program route's domain gate for paired clients (t379). A token call
// reaches its project -- the one its body names, or the session's current one
// when it names none -- only when that project's domain is the one the
// pairing bound. Here `assertProjectDomainAccess` stands for Core's own check
// (`AutomationStudioService.assertProjectDomainAccess`), which throws for a
// project outside the domain and for one that does not exist.

import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
const validateSession = vi.fn();
const snapshot = vi.fn();
const authorizeToken = vi.fn();
const endpoints = vi.fn();
const assertProjectDomainAccess = vi.fn();
let cookieValue: string | undefined;

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
      automationStudio: { assertProjectDomainAccess },
    },
  }),
  getFluxIQWebRuntimeStatus: vi.fn(),
}));

import { GET, POST } from "../route";

const TOKEN = "pairing-token-secret-value";
// A plain sentence and its own code, so the extension can show why rather than
// treat it as a refused token.
const OUTSIDE = {
  ok: false,
  errorCode: "authorization.project_domain",
  error: "This browser was paired for web automation projects, and this project is not one. Open a web automation project in FluxIQ, then try again.",
};

const PROJECT_DOMAINS: Record<string, string | null> = {
  "project-web": "web-automation",
  "project-desktop": "desktop-automation",
  "project-unscoped": null,
};

/** One endpoint of each kind the gate must hold for, with a body naming its project. */
const GATED: ReadonlyArray<readonly [string, string, Record<string, unknown>]> = [
  ["a run", "run-runtime-session", { flowId: "flow-1" }],
  ["a pause", "pause-runtime-session", { runId: "run-1", takeControl: true }],
  ["a Flow", "list-flow-summaries", {}],
  ["a recording", "remove-recording-entry", { recordingId: "rec-1", eventId: "event-1" }],
];

const CLASSIFICATIONS: Record<string, string> = {
  "run-runtime-session": "authoring",
  "pause-runtime-session": "authoring",
  "list-flow-summaries": "read",
  "remove-recording-entry": "authoring",
  "get-runtime-build-identity": "read",
  "list-conversations": "read",
  "get-conversation": "read",
};

function params(endpoint: string, programId = "automation-studio") {
  return { params: Promise.resolve({ programId, endpoint }) };
}

function tokenRequest(endpoint: string, body?: unknown) {
  return new Request(`http://127.0.0.1/api/programs/automation-studio/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function pairedSession(projectId?: string | null) {
  return { sessionId: "gateway-session-1", operatorUserId: "user:owner", metadata: { domainId: "web-automation" }, ...(projectId !== undefined ? { projectId } : {}) };
}

beforeEach(() => {
  for (const mock of [call, validateSession, snapshot, authorizeToken, endpoints, assertProjectDomainAccess]) mock.mockReset();
  cookieValue = undefined;
  validateSession.mockResolvedValue(null);
  authorizeToken.mockResolvedValue(pairedSession());
  snapshot.mockResolvedValue({
    users: [{ id: "user:owner", roleId: "role:admin", enabled: true }],
    roles: [{ id: "role:admin", permissions: ["programs.read", "programs.write", "flows.write", "runtime.control"] }],
  });
  endpoints.mockReturnValue([
    ...Object.entries(CLASSIFICATIONS).map(([endpoint, classification]) => ({ programId: "automation-studio", endpoint, permission: "programs.read", classification })),
    { programId: "secret-keys", endpoint: "snapshot", permission: "programs.read", classification: "read" },
  ]);
  // Core's check: the project must exist and be in exactly the domain asked about.
  assertProjectDomainAccess.mockImplementation(async (projectId: string, domainId?: string | null) => {
    if (!(projectId in PROJECT_DOMAINS)) throw new Error("Automation Studio project was not found.");
    if (PROJECT_DOMAINS[projectId] !== (domainId ?? null)) throw new Error("Automation Studio project is unavailable in this domain scope.");
  });
  call.mockResolvedValue({ ok: true, payload: {} });
});

describe("a paired client's token is gated to projects in the domain its pairing bound", () => {
  it.each(GATED)("refuses %s naming another domain's project, before any handler runs", async (_kind, endpoint, body) => {
    const response = await POST(tokenRequest(endpoint, { projectId: "project-desktop", ...body }), params(endpoint));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(OUTSIDE);
    expect(assertProjectDomainAccess).toHaveBeenCalledWith("project-desktop", "web-automation");
    expect(call).not.toHaveBeenCalled();
  });

  it.each(GATED)("lets %s naming a project in its own domain through", async (_kind, endpoint, body) => {
    const response = await POST(tokenRequest(endpoint, { projectId: "project-web", ...body }), params(endpoint));

    expect(response.status).toBe(200);
    expect(assertProjectDomainAccess).toHaveBeenCalledWith("project-web", "web-automation");
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ endpoint, scope: { domainId: "web-automation" } }));
  });

  it("refuses a project that does not exist the same way, so the answer says nothing about other ids", async () => {
    const response = await POST(tokenRequest("get-conversation", { projectId: "project-nowhere", conversationId: "c" }), params("get-conversation"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(OUTSIDE);
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses a projectId that is not a string rather than letting a handler coerce it", async () => {
    const response = await POST(tokenRequest("list-flow-summaries", { projectId: ["project-web"] }), params("list-flow-summaries"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client must name its project by a string projectId." });
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("checks the session's current project when the body names none, by POST and by GET", async () => {
    authorizeToken.mockResolvedValue(pairedSession("project-desktop"));

    const listed = await POST(tokenRequest("list-conversations", { projectId: null }), params("list-conversations"));
    const identity = await GET(new Request("http://127.0.0.1/api/programs/automation-studio/get-runtime-build-identity", { headers: { authorization: `Bearer ${TOKEN}` } }), params("get-runtime-build-identity"));

    expect([listed.status, identity.status]).toEqual([403, 403]);
    expect(assertProjectDomainAccess).toHaveBeenCalledWith("project-desktop", "web-automation");
    expect(call).not.toHaveBeenCalled();

    authorizeToken.mockResolvedValue(pairedSession("project-web"));
    const allowed = await POST(tokenRequest("list-conversations", {}), params("list-conversations"));
    expect(allowed.status).toBe(200);
  });

  it("checks nothing when neither the body nor the session names a project", async () => {
    authorizeToken.mockResolvedValue(pairedSession(null));
    const response = await GET(new Request("http://127.0.0.1/api/programs/automation-studio/get-runtime-build-identity", { headers: { authorization: `Bearer ${TOKEN}` } }), params("get-runtime-build-identity"));

    expect(response.status).toBe(200);
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
  });

  it("binds a client approved with no domain to projects with none", async () => {
    authorizeToken.mockResolvedValue({ ...pairedSession(), metadata: {} });

    const unscoped = await POST(tokenRequest("list-flow-summaries", { projectId: "project-unscoped" }), params("list-flow-summaries"));
    const web = await POST(tokenRequest("list-flow-summaries", { projectId: "project-web" }), params("list-flow-summaries"));

    expect([unscoped.status, web.status]).toEqual([200, 403]);
    expect(await web.json()).toEqual({
      ok: false,
      errorCode: "authorization.project_domain",
      error: "This browser was paired for projects without a domain, and this project has one. Open a project without a domain in FluxIQ, then try again.",
    });
  });

  it("does not gate the secret-keys snapshot, which names no project", async () => {
    authorizeToken.mockResolvedValue(pairedSession("project-desktop"));
    const response = await GET(new Request("http://127.0.0.1/api/programs/secret-keys/snapshot", { headers: { authorization: `Bearer ${TOKEN}` } }), params("snapshot", "secret-keys"));

    expect(response.status).toBe(200);
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
  });

  it("refuses a run that names authorizedDomainIds, which would let it act beyond the bound domain", async () => {
    const response = await POST(tokenRequest("run-runtime-session", { projectId: "project-web", flowId: "flow-1", authorizedDomainIds: ["desktop-automation"] }), params("run-runtime-session"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry authorizedDomainIds." });
    expect(call).not.toHaveBeenCalled();
  });

  it("leaves the web panel's cookie calls ungated, whatever project and domain they name", async () => {
    cookieValue = "authenticated-session";
    validateSession.mockResolvedValue({ user: { id: "user:person" }, role: { id: "role:person", permissions: ["programs.read", "runtime.control"] } });

    for (const [, endpoint, body] of GATED) {
      const response = await POST(tokenRequest(endpoint, { projectId: "project-desktop", ...body }), params(endpoint));
      expect({ endpoint, status: response.status }).toEqual({ endpoint, status: 200 });
    }
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
    expect(authorizeToken).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(GATED.length);
  });
});
