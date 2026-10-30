// The trace artifact upload (traces and offline trials, P2; D13): a paired
// client's bearer token, bound to its own gateway session; HTML, CSS, images
// and fonts only; 20 MB by header and by body; the digest verified by the
// gateway's trace intake; the answer says how many traces took it.

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CLIENT_GATEWAY_TRACE_ARTIFACT_PATH } from "fluxiq/client-gateway";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeToken = vi.fn();
const receiveTraceArtifact = vi.fn();

const snapshot = vi.fn();

// A real registry on the local profile decides the route, as live; the token acts as the person who approved it.
vi.mock("../../../../../../lib/fluxiq", async () => {
  const { GlobalProgramApiRegistry } = await import("fluxiq");
  const api = new GlobalProgramApiRegistry();
  return { getFluxIQ: () => ({ programs: { api, identityAccess: { snapshot }, clientGateway: { authorizeToken, receiveTraceArtifact } } }) };
});

import { PUT } from "../route";

const TOKEN = "pairing-token-secret-value";
const BODY = new TextEncoder().encode("<!doctype html><p>snapshot</p>");
const SHA = createHash("sha256").update(BODY).digest("hex");

function upload(input: { sha256?: string; token?: string | null; mediaType?: string; body?: Uint8Array<ArrayBuffer>; contentLength?: string; query?: string } = {}) {
  const sha256 = input.sha256 ?? SHA;
  const body = input.body ?? BODY;
  const token = input.token === undefined ? TOKEN : input.token;
  return PUT(
    new Request(`http://127.0.0.1${CLIENT_GATEWAY_TRACE_ARTIFACT_PATH}/${sha256}${input.query ?? ""}`, {
      method: "PUT",
      headers: {
        "content-type": input.mediaType ?? "text/html; charset=utf-8",
        "content-length": input.contentLength ?? String(body.byteLength),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
    }),
    { params: Promise.resolve({ sha256 }) },
  );
}

beforeEach(() => {
  authorizeToken.mockReset();
  receiveTraceArtifact.mockReset();
  snapshot.mockReset();
  snapshot.mockResolvedValue({ users: [{ id: "user:owner", roleId: "role:viewer", enabled: true }], roles: [{ id: "role:viewer", permissions: ["programs.read"] }] });
  authorizeToken.mockResolvedValue({ sessionId: "gateway-session-1", clientId: "client-1", trustedClientId: "trusted-1", operatorUserId: "user:owner", metadata: { domainId: "web-automation" } });
  receiveTraceArtifact.mockImplementation((_sessionId: string, artifact: { sha256: string; bytes: Uint8Array }) =>
    createHash("sha256").update(artifact.bytes).digest("hex") === artifact.sha256 ? { status: "accepted", traces: 2 } : { status: "refused", reason: "digest_mismatch" },
  );
});

describe("the trace artifact route", () => {
  it("lives at the path the wire contract names", () => {
    const routeDirectory = fileURLToPath(new URL("..", import.meta.url)).replace(/\\/g, "/");
    expect(routeDirectory).toMatch(new RegExp(`/app${CLIENT_GATEWAY_TRACE_ARTIFACT_PATH}/\\[sha256\\]/$`));
  });

  it("hands the artifact to the trace intake for the client's own session, and answers how many traces took it", async () => {
    const response = await upload();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 2 } });
    expect(authorizeToken).toHaveBeenCalledWith(TOKEN);
    expect(receiveTraceArtifact).toHaveBeenCalledWith("gateway-session-1", { sha256: SHA, mediaType: "text/html", bytes: BODY });
  });

  it("answers zero traces as success: the session is simply not traced", async () => {
    receiveTraceArtifact.mockReturnValue({ status: "accepted", traces: 0 });
    const response = await upload({ mediaType: "font/woff2" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 0 } });
  });

  it("takes a digest written in upper case as its lower-case form", async () => {
    expect((await upload({ sha256: SHA.toUpperCase() })).status).toBe(200);
    expect(receiveTraceArtifact).toHaveBeenCalledWith("gateway-session-1", expect.objectContaining({ sha256: SHA }));
  });
});

describe("the trace artifact route refuses", () => {
  it("an upload with no bearer token, or one the gateway does not know, before reading anything", async () => {
    expect((await upload({ token: null })).status).toBe(401);
    expect(authorizeToken).not.toHaveBeenCalled();
    authorizeToken.mockResolvedValue(null);
    const response = await upload({ token: "unknown-token" });
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("unknown-token");
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("a client reaching for a domain other than the one its pairing bound", async () => {
    expect((await upload({ query: "?domainId=desktop-automation" })).status).toBe(403);
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("a digest that is not 64 hex characters", async () => {
    expect((await upload({ sha256: "not-a-digest" })).status).toBe(400);
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("a media type outside HTML, CSS, images and fonts", async () => {
    for (const mediaType of ["application/javascript", "text/plain", "application/octet-stream", "image", "fontish/woff", ""]) {
      expect((await upload({ mediaType })).status).toBe(415);
    }
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("an upload over 20 MB, by its declared length or by its body", async () => {
    expect((await upload({ contentLength: String(20 * 1024 * 1024 + 1) })).status).toBe(413);
    const oversized = new Uint8Array(20 * 1024 * 1024 + 1);
    expect((await upload({ body: oversized, contentLength: "1", sha256: createHash("sha256").update(oversized).digest("hex"), mediaType: "image/png" })).status).toBe(413);
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("an empty body", async () => {
    expect((await upload({ body: new Uint8Array(0) })).status).toBe(400);
    expect(receiveTraceArtifact).not.toHaveBeenCalled();
  });

  it("bytes that do not hash to the digest in the path", async () => {
    const response = await upload({ sha256: "c".repeat(64) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "Trace artifact digest does not match its bytes." });
  });
});
