import { expect, it } from "vitest";
import type { ClientGatewaySession, ClientGatewayStartRecordingRequest, ClientGatewayTrustedClientView } from "@fluxiq/contracts/client-gateway";
import { TrustedRecordingDomain } from "../index.ts";

function fixture(domainId: string | null | undefined = "approved") {
  const session: ClientGatewaySession = { sessionId: "session", clientId: "client", clientType: "custom", name: "Client", status: "ready", connectedAt: 1, lastSeenAt: 1, trustedClientId: "trust", capabilities: [] };
  const client: ClientGatewayTrustedClientView = { trustedClientId: "trust", clientId: "client", clientType: "custom", name: "Client", approvedByUserId: "operator", approvedAt: 1, createdAt: 1, updatedAt: 1, lastUsedAt: 1, expiresAt: 100, status: "active", ...(domainId !== undefined ? { domainId } : {}) };
  const receiver = Object.freeze({ original: "project service" });
  const calls: { receiver: unknown; projectId: string; domainId: string | null }[] = [];
  let assertDomain: () => Promise<void> = async () => {};
  const projects = { receiver, async assertDomain(this: unknown, projectId: string, domainId: string | null) {
    calls.push({ receiver: this, projectId, domainId });
    await assertDomain();
  } };
  const view = { sessions: [session], trustedClients: [client] };
  const scope = new TrustedRecordingDomain({ snapshot: () => view }, projects);
  const request: ClientGatewayStartRecordingRequest = { recordingId: "recording" };
  return { scope, session, client, receiver, calls, view, request, setProjectCheck(value: () => Promise<void>) { assertDomain = value; } };
}

it("selects the existing approved domain and preserves the original project callback receiver and tuple", async () => {
  const f = fixture();
  f.session.metadata = { domainId: "untrusted-session-copy" };
  const approved = f.scope.read(f.session, f.request);
  expect(approved).toEqual({ trustedClientId: "trust", domainId: "approved" });
  await f.scope.assertProject(f.session, f.request, "project", approved);
  expect(f.calls).toEqual([{ receiver: f.receiver, projectId: "project", domainId: "approved" }]);
});

it.each([
  { domainId: "foreign" }, { domainId: "" },
  { environment: { domainId: "foreign" } }, { environment: { domainId: null } },
  { metadata: { domainId: "foreign" } }, { metadata: { domainId: 23 } }
])("refuses conflicting submitted scope before project IO: %j", supplied => {
  const f = fixture();
  expect(() => f.scope.read(f.session, { ...f.request, ...supplied })).toThrow("recording.domain_scope_refused");
  expect(f.calls).toEqual([]);
});

it.each([undefined, "", " ", " approved "])("refuses a legacy or malformed approved domain: %j", domainId => {
  const f = fixture(null);
  if (domainId === undefined) delete f.client.domainId;
  else f.client.domainId = domainId;
  expect(() => f.scope.read(f.session, f.request)).toThrow("recording.domain_scope_refused");
});

it.each(["expired", "revoked"] as const)("refuses %s trust", status => {
  const f = fixture();
  f.client.status = status;
  expect(() => f.scope.read(f.session, f.request)).toThrow("recording.client_scope_refused");
  expect(f.calls).toEqual([]);
});

it("refuses disconnected, missing and foreign current trust without selecting a policy", () => {
  const f = fixture();
  f.session.status = "disconnected";
  expect(() => f.scope.read(f.session, f.request)).toThrow("recording.client_scope_refused");
  f.session.status = "ready";
  f.client.clientId = "foreign";
  expect(() => f.scope.read(f.session, f.request)).toThrow("recording.client_scope_refused");
  f.view.trustedClients.length = 0;
  expect(() => f.scope.read(f.session, f.request)).toThrow("recording.client_scope_refused");
  expect(f.calls).toEqual([]);
});

it("keeps explicitly approved null scope passive and requires a project for a domain recording", async () => {
  const passive = fixture(null);
  await passive.scope.assertProject(passive.session, passive.request, null, passive.scope.read(passive.session, passive.request));
  expect(passive.calls).toEqual([]);
  const active = fixture();
  await expect(active.scope.assertProject(active.session, active.request, null, active.scope.read(active.session, active.request))).rejects.toThrow("recording.project_required");
  expect(active.calls).toEqual([]);
});

it("preserves project refusal and rechecks revocation after an awaited project read", async () => {
  const f = fixture();
  const failure = new Error("original project refusal");
  f.setProjectCheck(async () => { throw failure; });
  await expect(f.scope.assertProject(f.session, f.request, "project", f.scope.read(f.session, f.request))).rejects.toBe(failure);
  let release!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  f.setProjectCheck(async () => {
    enter();
    await held;
  });
  const result = f.scope.assertProject(f.session, f.request, "project", f.scope.read(f.session, f.request));
  await entered;
  f.client.status = "revoked";
  release();
  await expect(result).rejects.toThrow("recording.client_scope_refused");
});
