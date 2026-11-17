import "./mocks";
import { fileURLToPath } from "node:url";
import { CLIENT_GATEWAY_TRACE_ARTIFACT_PATH } from "fluxiq/client-gateway";
import { drainState } from "fluxiq/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registry, runtime } from "../../../../../../lib/workspaces/routes/tests/route-runtime";
import { PUT } from "../route";
import { BODY, SHA, closeTraceRuntime, resetTraceRuntime, traceRuntime, uploadRequest } from "./trace-runtime";

beforeEach(resetTraceRuntime);
afterEach(closeTraceRuntime);
const upload = (options: Parameters<typeof uploadRequest>[0] = {}) => PUT(uploadRequest(options), { params: Promise.resolve({ sha256: options.sha256 ?? SHA }) });

describe("held tenant trace artifact upload", () => {
  it("lives at the public wire contract's path", () => {
    expect(fileURLToPath(new URL("..", import.meta.url)).replaceAll("\\", "/").endsWith(`${CLIENT_GATEWAY_TRACE_ARTIFACT_PATH}/[sha256]/`)).toBe(true);
  });

  it("passes colliding ids and exact bytes only to the proved tenant gateway", async () => {
    const a = await upload();
    const b = await upload({ token: "trace-b", query: "?domainId=domain-b&sessionId=forged&workspaceId=tenant-a" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 0 } });
    expect(await b.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 0 } });
    for (const tenant of ["a", "b"] as const) expect(traceRuntime.intakes.get(tenant)).toHaveBeenCalledWith("same-session", { sha256: SHA, mediaType: "text/html", bytes: BODY });
    expect(traceRuntime.intakes.get("primary")).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser.mock.calls).toEqual([["trace-a"], ["trace-b"]]);
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
    expect(a.headers.get("cache-control")).toBe("private, no-store");
  });

  it("freezes only the proved browser IAM resource, ignoring body/query authority claims", async () => {
    const authorize = vi.spyOn(runtime.tenantA.programs.api, "authorize");
    expect((await upload({ query: "?domainId=domain-a&trustedClientId=foreign&operatorUserId=person-b" })).status).toBe(200);
    expect(authorize.mock.calls.length).toBeGreaterThan(0);
    for (const [input] of authorize.mock.calls) {
      expect(input.action).toBe("gateway:PutTraceArtifact");
      expect(input.resources).toEqual({ kind: "client", clientId: "same-trust" });
    }
  });

  it("keeps upper-case digest normalization and zero-open-traces success", async () => {
    const response = await upload({ sha256: SHA.toUpperCase() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 0 } });
    expect(traceRuntime.intakes.get("a")).toHaveBeenCalledWith("same-session", expect.objectContaining({ sha256: SHA }));
  });

  it.each(["text/css", "image/png", "font/woff2"])("preserves accepted %s media", async mediaType => {
    expect((await upload({ mediaType })).status).toBe(200);
    expect(traceRuntime.intakes.get("a")).toHaveBeenCalledWith("same-session", expect.objectContaining({ mediaType }));
  });

  it("refuses absent or unknown bearer proof before reading the body", async () => {
    for (const token of [null, "unknown"]) {
      const request = uploadRequest({ token });
      const read = vi.spyOn(request, "arrayBuffer");
      expect((await PUT(request, { params: Promise.resolve({ sha256: SHA }) })).status).toBe(401);
      expect(read).not.toHaveBeenCalled();
    }
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.releases.a).not.toHaveBeenCalled();
  });

  it("refuses the panel channel before proof lookup rather than falling back to bearer", async () => {
    for (const cookie of [runtime.sessions.a, "invalid-cookie"]) expect((await upload({ cookie })).status).toBe(403);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
  });

  it("refuses a foreign domain and managed sessions before intake", async () => {
    expect((await upload({ query: "?domainId=domain-b" })).status).toBe(403);
    traceRuntime.sessions.get("a")!.managedHostId = "managed-elsewhere";
    expect((await upload()).status).toBe(401);
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledTimes(2);
  });

  it("preserves Core's digest, media, empty and size refusals without intake", async () => {
    expect((await upload({ sha256: "invalid" })).status).toBe(400);
    for (const mediaType of ["application/javascript", "text/plain", "application/octet-stream", "image", "fontish/woff", ""]) expect((await upload({ mediaType })).status).toBe(415);
    expect((await upload({ body: new Uint8Array(0) })).status).toBe(400);
    expect((await upload({ contentLength: String(20 * 1024 * 1024 + 1) })).status).toBe(413);
    expect((await upload({ body: new Uint8Array(20 * 1024 * 1024 + 1), contentLength: "1" })).status).toBe(413);
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
  });

  it("delegates digest mismatch to the real Core gateway intake", async () => {
    const response = await upload({ sha256: "c".repeat(64) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "Trace artifact digest does not match its bytes." });
    expect(traceRuntime.intakes.get("a")).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("handles malformed and rejected params safely while holding/releasing one lease", async () => {
    const params = { sha256: SHA };
    Object.assign(params, { sha256: 123 });
    expect((await PUT(uploadRequest(), { params: Promise.resolve(params) })).status).toBe(400);
    const rejected = { get params(): Promise<{ sha256: string }> { return Promise.reject(new Error("private params path")); } };
    const response = await PUT(uploadRequest(), rejected);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private params");
    expect(runtime.releases.a).toHaveBeenCalledTimes(2);
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
  });

  it.each(["body", "intake"])("sanitizes %s exceptions and releases after work settles", async source => {
    const request = uploadRequest();
    if (source === "body") vi.spyOn(request, "arrayBuffer").mockRejectedValueOnce(new Error("private body credential-value"));
    else traceRuntime.intakes.get("a")!.mockImplementationOnce(() => { throw new Error("private intake credential-value"); });
    const response = await PUT(request, { params: Promise.resolve({ sha256: SHA }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Trace artifact upload could not be completed." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("keeps tenant IAM denial/outage distinct without touching data", async () => {
    runtime.policies.set("tenant-a", "none");
    expect((await upload()).status).toBe(403);
    runtime.policyError = true;
    const response = await upload();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private policy");
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledTimes(2);
  });

  it("allows authorized in-flight completion while draining", async () => {
    drainState.markDraining();
    expect((await upload()).status).toBe(200);
    expect(traceRuntime.intakes.get("a")).toHaveBeenCalledOnce();
  });

  it.each(["local", "self-hosted"] as const)("preserves %s single-root paired uploads", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    const response = await upload({ token: "trace-primary" });
    expect(response.status).toBe(200);
    expect(traceRuntime.intakes.get("primary")).toHaveBeenCalledOnce();
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).toHaveBeenCalledOnce();
    expect(runtime.manager.acquire).toHaveBeenCalledWith("workspace-main");
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });
});
