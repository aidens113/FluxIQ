import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ClientGatewayService, type ClientGatewayServerMessage } from "../../../client-gateway/index.ts";
import { clientMessage } from "../../../client-gateway/tests/trace-tap-support.ts";
import type { FluxIQ } from "../../../framework/index.ts";
import { GlobalProgramApiRegistry } from "../../../programs/_shared/api.ts";
import { endpointResource } from "../../../programs/_shared/iam/index.ts";
import { handleProgramRequest } from "../../program-route/index.ts";
import { handleManagedClientRequest } from "../managed-request.ts";

async function fixture() {
  const gateway = new ClientGatewayService();
  const sent: ClientGatewayServerMessage[] = [];
  const session = gateway.connect({ socket: { send: (raw) => { sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } } });
  const ticket = gateway.managedHosts.issueHostEnrolment({ hostId: "one", domainId: "web", profile: "fresh" });
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "browser", clientType: "extension", name: "Managed test", metadata: { domainId: "web" }, enrolmentTicket: ticket.ticket }));
  const ready = sent.find((message) => message.type === "server.session_ready");
  if (ready?.type !== "server.session_ready" || !ready.payload.token) throw new Error("Fixture did not enrol");
  const token = ready.payload.token;
  let current = true;
  const release = gateway.managedHosts.bindRun({ sessionId: session.sessionId, projectId: "p1", domainId: "web", runId: "r1",
    lease: { sessionId: session.sessionId, resourceKey: "host:one", epoch: 1, holder: { role: "fluxnode-run", briefId: "r1" } }, isCurrent: () => current });
  const registry = new GlobalProgramApiRegistry();
  const policyRead = vi.fn(async (request: { payload?: unknown }) => ({ ok: true, payload: request.payload }));
  registry.register({ programId: "automation-studio", endpoint: "get-recording-capture-policy", permission: "programs.read", classification: "read", action: "studio:GetRecordingCapturePolicy", accessLevel: "Read",
    resource: endpointResource.custom(["project"], (request) => ({ kind: "project", projectId: (request.payload as { projectId: string }).projectId })), handler: policyRead });
  const stateWrite = vi.fn(async () => ({ sha256: "fixture" }));
  const traceWrite = vi.spyOn(gateway, "receiveTraceArtifact").mockReturnValue({ status: "accepted", traces: 1 });
  const fluxiq = { programs: { clientGateway: gateway, api: registry,
    automationStudio: { assertProjectDomainAccess: vi.fn(async () => undefined), writeProjectObjectAsset: stateWrite },
    identityAccess: { validateSession: async () => null, snapshot: async () => ({ users: [], roles: [] }) }
  } } as unknown as FluxIQ;
  const send = (path: string, init: RequestInit = {}) => handleManagedClientRequest(new Request(`http://127.0.0.1${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } }), fluxiq);
  return { fluxiq, gateway, token, session, release, send, stateWrite, traceWrite, policyRead, expire: () => { current = false; } };
}

describe("headless managed browser HTTP authority", () => {
  it("answers only its own current context and policy without a fictitious directory user", async () => {
    const f = await fixture();
    const snapshot = await f.send("/api/client-gateway/snapshot");
    expect(snapshot?.status).toBe(200);
    expect(JSON.parse(snapshot!.body).payload.sessions).toEqual([{ sessionId: f.session.sessionId, clientId: "browser", managedHostId: "one", status: "ready", projectId: "p1" }]);
    const policy = await handleProgramRequest({ method: "POST", url: "http://127.0.0.1/api/programs/automation-studio/get-recording-capture-policy", programId: "automation-studio", endpoint: "get-recording-capture-policy", sessionId: undefined, authorization: `Bearer ${f.token}`, readJson: async () => ({}) }, { fluxiq: f.fluxiq });
    expect(policy.status).toBe(200);
    expect(f.policyRead).toHaveBeenCalledWith(expect.objectContaining({ payload: { projectId: "p1" } }));
    f.release();
    expect((await f.send("/api/client-gateway/first-project", { method: "POST" }))?.status).toBe(403);
  });

  it("refuses another project and a forged digest/path before storing any state", async () => {
    const f = await fixture();
    const digest = createHash("sha256").update("image").digest("hex");
    expect((await f.send(`/api/programs/automation-studio/state-assets/p2/${digest}`, { method: "PUT", body: "image", headers: { "content-type": "image/png" } }))?.status).toBe(403);
    expect((await f.send("/api/programs/automation-studio/state-assets/p1/not-a-digest", { method: "PUT", body: "image", headers: { "content-type": "image/png" } }))?.status).toBe(400);
    expect(f.stateWrite).not.toHaveBeenCalled();
    const trace = await f.send(`/api/client-gateway/trace-artifacts/${digest}?sessionId=someone-else`, { method: "PUT", body: "image", headers: { "content-type": "image/png" } });
    expect(trace?.status).toBe(403);
    expect(f.traceWrite).not.toHaveBeenCalled();
    const ownTrace = await f.send(`/api/client-gateway/trace-artifacts/${digest}`, { method: "PUT", body: "image", headers: { "content-type": "image/png" } });
    expect(ownTrace?.status).toBe(200);
    expect(f.traceWrite.mock.calls[0]?.[0]).toBe(f.session.sessionId);
    f.release();
  });

  it("rechecks the lease after an asynchronous upload body, before either intake writes", async () => {
    const f = await fixture();
    const bytes = new TextEncoder().encode("image");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const response = await handleManagedClientRequest({ url: `http://127.0.0.1/api/client-gateway/trace-artifacts/${digest}`, method: "PUT", headers: new Headers({ authorization: `Bearer ${f.token}`, "content-type": "image/png" }),
      arrayBuffer: async () => {
        f.expire();
        return bytes.buffer;
      } }, f.fluxiq);
    expect(response?.status).toBe(403);
    expect(f.traceWrite).not.toHaveBeenCalled();
    expect(f.stateWrite).not.toHaveBeenCalled();
    f.release();
  });

  it("revoking stored trust removes authority even while the browser has not sent another hello", async () => {
    const f = await fixture();
    await f.gateway.managedHosts.revokeManagedHost("one");
    expect((await f.send("/api/client-gateway/snapshot"))?.status).toBe(401);
    f.release();
  });

  it("refuses state writes when the token is revoked while its body is still arriving", async () => {
    const f = await fixture();
    const bytes = new TextEncoder().encode("image");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const response = await handleManagedClientRequest({ url: `http://127.0.0.1/api/programs/automation-studio/state-assets/p1/${digest}`, method: "PUT",
      headers: new Headers({ authorization: `Bearer ${f.token}`, "content-type": "image/png" }),
      arrayBuffer: async () => {
        await f.gateway.managedHosts.revokeManagedHost("one");
        return bytes.buffer;
      } }, f.fluxiq);
    expect(response?.status).toBe(403);
    expect(f.stateWrite).not.toHaveBeenCalled();
    f.release();
  });
});
