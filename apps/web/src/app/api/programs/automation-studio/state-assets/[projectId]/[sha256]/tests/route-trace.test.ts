// The state-asset upload and traces (traces and offline trials, P2; D13): a
// paired client's screenshot is handed down with the client's gateway session
// and the gateway's trace intake, so traces claiming that session take it; a
// signed-in person's upload has no gateway session and carries none.

import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeToken = vi.fn();
const receiveTraceArtifact = vi.fn();
const validateSession = vi.fn();
const assertProjectDomainAccess = vi.fn();
const writeProjectObjectAsset = vi.fn();
let cookieValue: string | undefined;
const clientGateway = { authorizeToken, receiveTraceArtifact };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => (cookieValue === undefined ? undefined : { value: cookieValue })) })),
}));
vi.mock("../../../../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      clientGateway,
      identityAccess: { validateSession },
      automationStudio: { assertProjectDomainAccess, writeProjectObjectAsset },
    },
  }),
}));

import { PUT } from "../route";

const SHA = "a".repeat(64);

function upload(token: string | null) {
  const body = new Uint8Array([137, 80, 78, 71]);
  return PUT(
    new Request(`http://127.0.0.1/api/programs/automation-studio/state-assets/project-web/${SHA}`, {
      method: "PUT",
      headers: { "content-type": "image/png", "content-length": String(body.byteLength), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
    }),
    { params: Promise.resolve({ projectId: "project-web", sha256: SHA }) },
  );
}

beforeEach(() => {
  for (const mock of [authorizeToken, receiveTraceArtifact, validateSession, assertProjectDomainAccess, writeProjectObjectAsset]) mock.mockReset();
  cookieValue = undefined;
  authorizeToken.mockResolvedValue({ sessionId: "gateway-session-7", activeRecordingId: "recording-3", metadata: { domainId: "web-automation" } });
  assertProjectDomainAccess.mockResolvedValue(undefined);
  writeProjectObjectAsset.mockResolvedValue({ sha256: SHA, contentRef: `object:${SHA}` });
});

describe("a state-asset upload and traces", () => {
  it("passes a paired client's gateway session and the gateway's trace intake down with the screenshot", async () => {
    const response = await upload("pairing-token");

    expect(response.status).toBe(201);
    expect(writeProjectObjectAsset).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-web",
      recordingId: "recording-3",
      expectedSha256: SHA,
      traceIntake: { sessionId: "gateway-session-7", gateway: clientGateway },
    }));
  });

  it("passes no trace intake for a signed-in person's upload", async () => {
    cookieValue = "authenticated-session";
    validateSession.mockResolvedValue({ user: { id: "user:person" }, role: { id: "role:person", permissions: ["programs.write"] } });
    expect((await upload(null)).status).toBe(201);
    expect(writeProjectObjectAsset.mock.calls[0]?.[0]).not.toHaveProperty("traceIntake");
  });
});
