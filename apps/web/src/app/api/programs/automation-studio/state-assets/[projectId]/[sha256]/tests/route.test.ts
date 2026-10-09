// The state-asset upload's domain gate (t379): a paired client's token stores
// an asset only in a project of the domain its pairing bound; a signed-in
// person's cookie uploads as before.

import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeToken = vi.fn();
const validateSession = vi.fn();
const assertProjectDomainAccess = vi.fn();
const writeProjectObjectAsset = vi.fn();
let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => (cookieValue === undefined ? undefined : { value: cookieValue })) })),
}));
vi.mock("../../../../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      clientGateway: { authorizeToken },
      identityAccess: { validateSession },
      automationStudio: { assertProjectDomainAccess, writeProjectObjectAsset },
    },
  }),
}));

import { PUT } from "../route";

const TOKEN = "pairing-token-secret-value";
const SHA = "a".repeat(64);
const PROJECT_DOMAINS: Record<string, string | null> = { "project-web": "web-automation", "project-desktop": "desktop-automation" };

function upload(projectId: string, token: string | null = TOKEN) {
  const body = new Uint8Array([137, 80, 78, 71]);
  return PUT(
    new Request(`http://127.0.0.1/api/programs/automation-studio/state-assets/${projectId}/${SHA}`, {
      method: "PUT",
      headers: { "content-type": "image/png", "content-length": String(body.byteLength), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
    }),
    { params: Promise.resolve({ projectId, sha256: SHA }) },
  );
}

beforeEach(() => {
  for (const mock of [authorizeToken, validateSession, assertProjectDomainAccess, writeProjectObjectAsset]) mock.mockReset();
  cookieValue = undefined;
  authorizeToken.mockResolvedValue({ sessionId: "g1", operatorUserId: "user:owner", metadata: { domainId: "web-automation" } });
  assertProjectDomainAccess.mockImplementation(async (projectId: string, domainId?: string | null) => {
    if (!(projectId in PROJECT_DOMAINS) || PROJECT_DOMAINS[projectId] !== (domainId ?? null)) throw new Error("unavailable");
  });
  writeProjectObjectAsset.mockResolvedValue({ sha256: SHA, contentRef: `object:${SHA}` });
});

describe("a paired client's state-asset upload", () => {
  it("is refused for a project in another domain, with a reason the extension can show, before anything is stored", async () => {
    const response = await upload("project-desktop");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      errorCode: "authorization.project_domain",
      error: "This browser was paired for web automation projects, and this project is not one. Open a web automation project in FluxIQ, then try again.",
    });
    expect(assertProjectDomainAccess).toHaveBeenCalledWith("project-desktop", "web-automation");
    expect(writeProjectObjectAsset).not.toHaveBeenCalled();
  });

  it("is refused the same way for a project that does not exist", async () => {
    expect((await upload("project-nowhere")).status).toBe(403);
    expect(writeProjectObjectAsset).not.toHaveBeenCalled();
  });

  it("stores the asset in a project of its own domain", async () => {
    const response = await upload("project-web");

    expect(response.status).toBe(201);
    expect(writeProjectObjectAsset).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-web", mediaType: "image/png", expectedSha256: SHA }));
  });

  it("leaves a signed-in person's upload ungated", async () => {
    cookieValue = "authenticated-session";
    validateSession.mockResolvedValue({ user: { id: "user:person" }, role: { id: "role:person", permissions: ["programs.write"] } });
    const response = await upload("project-desktop", null);

    expect(response.status).toBe(201);
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
    expect(authorizeToken).not.toHaveBeenCalled();
  });
});
