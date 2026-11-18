// @fluxiq-test-group real-sql
// Covers authority.ts through the real runtime on the hosted (`service`) IAM profile, beyond the focus itself:
// - the approving person is read where the paired program route reads people, so on a hosted tenant, whose people
//   live in its host's identity and not its own, the tenant's paired browser can still focus (and a person known only
//   to the tenant's own directory cannot);
// - the decision is one project's, made from access as it stands at each question (the gateway reuses it until access
//   changes, `client-gateway/service/project-focus/activity-delivery.ts`): a removed policy, a project the instance
//   does not hold, a deleted project and a disabled person each refuse, a restored policy reads again, and an IAM outage
//   throws rather than refusing.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayProjectFocusAuthority, type ClientGatewaySession, type ClientGatewaySocket } from "../../../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../../../framework/index.ts";
import type { IamPolicy, IamPolicySource } from "../../../../../platform/iam/index.ts";
import { IAM_USER_ACCESS } from "../../../../../platform/iam/predefined/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../../index.ts";
import type { ProgramApiActor } from "../../../../_shared/api.ts";
import type { IdentityAccessService } from "../../../../identity-access/index.ts";
import { installPairedProjectFocus } from "../index.ts";

const DOMAIN = "example";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const ALICE = { userId: "user.alice", sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;

function pathsAt(root: string): FluxIQHostPaths {
  const fluxiq = path.join(root, ".fluxiq");
  const at = (name: string) => path.join(fluxiq, name);
  return {
    root, fluxiq, config: at("fluxiq.json"), data: at("data"), databases: at("databases"), inputs: at("inputs"), outputs: at("outputs"),
    streams: at("streams"), domains: at("domains"), domainPrograms: at("domain-programs"), domainInputs: at("domain-inputs"),
    domainOutputs: at("domain-outputs"), domainConfigs: at("domain-configs"), domainData: at("domain-data"), domainDatabases: at("domain-databases"),
    recordings: at("recordings"), policies: at("policies"), logs: at("logs"), temp: at("temp"),
  };
}

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: Array<{ type: string; payload: any }> = [];
  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }
}

/** A policy source whose attachments the test changes, and can make fail, as a host's IAM store would. */
function changingPolicies() {
  const state: { identity: IamPolicy[]; failing: boolean } = { identity: [IAM_USER_ACCESS], failing: false };
  const source: IamPolicySource = {
    resolvePolicySet: async () => {
      if (state.failing) throw new Error("policy store unavailable");
      return { identity: state.identity, guardrails: [], sessions: [], boundary: null };
    },
    getRole: async () => null
  };
  return { state, source };
}

describe("the paired project authority, on the person's identity and access as they stand", () => {
  let root = "";
  let runtime: GlobalProgramRuntime | undefined;

  afterEach(async () => {
    // Closed as an instance closes its runtime (`FluxIQ.close`): a deleted project's removal opens Automation Studio's
    // UI cache, and on Windows `rm` never settles on a directory holding an open SQLite file (it hung this hook for 60 s).
    runtime?.detach();
    await runtime?.automationStudio.close();
    runtime?.secretKeys.close();
    runtime = undefined;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const start = async (options: Parameters<typeof createGlobalProgramRuntime>[1]) => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-access-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, ...options });
    return runtime;
  };
  const made = async (live: GlobalProgramRuntime, name: string): Promise<string> => {
    const answer = await live.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId: DOMAIN }, actor: ALICE, payload: { name } }) as { ok: boolean; error?: string; payload?: { project?: { id: string } } };
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };

  it("finds a hosted tenant's person in the host's identity, which the paired program route reads, not the tenant's own", async () => {
    // The host's platform directory knows Alice; the tenant's own Identity Access knows only Mallory.
    const platform = { snapshot: async () => ({ users: [{ id: ALICE.userId, roleId: "viewer", enabled: true }], roles: [{ id: "viewer", permissions: PERMISSIONS }] }), directoryChanges: { subscribe: () => () => undefined } } as unknown as IdentityAccessService;
    const tenant = await start({ iam: { profile: "service", source: changingPolicies().source }, secretKeyIdentityAuthority: async () => platform });
    await tenant.identityAccess.upsertUser({ id: "user.mallory", username: "mallory", displayName: "Mallory", roleId: "viewer" });
    const own = await made(tenant, "Own");

    const focus = async (approvedByUserId: string) => {
      const socket = new RecordingSocket();
      const { sessionId } = tenant.clientGateway.connect({ socket });
      await tenant.clientGateway.receiveRaw(sessionId, envelope("client.hello", { clientId: `extension.${approvedByUserId}`, clientType: "extension", name: "Browser", capabilities: [{ id: CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, kind: "state" }], metadata: { domainId: DOMAIN } }));
      const pairing = tenant.clientGateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === sessionId);
      expect((await tenant.clientGateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId }))?.status).toBe("ready");
      await tenant.clientGateway.receiveRaw(sessionId, envelope("client.focus_project", { projectId: own }));
      return socket.sent.at(-1);
    };

    expect(await focus(ALICE.userId)).toEqual(expect.objectContaining({ type: "server.project_focused", payload: { projectId: own } }));
    expect((await focus("user.mallory"))?.payload.code).toBe(CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.refused);
  });

  it("decides one project as access stands now: a removed policy, a project it does not hold and a disabled person refuse; an outage throws", async () => {
    const policies = changingPolicies();
    const live = await start({ iam: { profile: "service", source: policies.source } });
    await live.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    let authority: ClientGatewayProjectFocusAuthority | undefined;
    installPairedProjectFocus({ registry: live.api, service: live.automationStudio, identity: async () => live.identityAccess, clientGateway: { projectFocus: { setAuthority: (installed) => { authority = installed; } }, conversationPush: { setAuthority: () => undefined } } });
    const own = await made(live, "Own");
    const second = await made(live, "Second");
    const session = { sessionId: "gateway.session", operatorUserId: ALICE.userId } as ClientGatewaySession;
    const mayRead = (projectId: string) => authority!({ session, projectId, domainId: DOMAIN });

    expect(await mayRead(own)).toBe(true);
    expect(await mayRead(second)).toBe(true);
    // A project this instance does not hold (deleted, or another tenant's) fails the domain gate.
    expect(await mayRead("project.gone")).toBe(false);

    policies.state.failing = true;
    await expect(mayRead(second)).rejects.toThrow("could not be decided");
    policies.state.failing = false;

    policies.state.identity = [];
    expect(await mayRead(second)).toBe(false);
    policies.state.identity = [IAM_USER_ACCESS];
    expect(await mayRead(second)).toBe(true);

    await live.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer", enabled: false });
    expect(await mayRead(second)).toBe(false);
  });

  it("refuses a project once it is deleted", async () => {
    const live = await start({ iam: { profile: "service", source: changingPolicies().source } });
    await live.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    let authority: ClientGatewayProjectFocusAuthority | undefined;
    installPairedProjectFocus({ registry: live.api, service: live.automationStudio, identity: async () => live.identityAccess, clientGateway: { projectFocus: { setAuthority: (installed) => { authority = installed; } }, conversationPush: { setAuthority: () => undefined } } });
    const gone = await made(live, "Gone");
    const session = { sessionId: "gateway.session", operatorUserId: ALICE.userId } as ClientGatewaySession;
    expect(await authority!({ session, projectId: gone, domainId: DOMAIN })).toBe(true);
    await live.automationStudio.deleteProject(gone);
    expect(await authority!({ session, projectId: gone, domainId: DOMAIN })).toBe(false);
  });
});

/** A client message as its socket's text. */
function envelope(type: string, payload: unknown): string {
  return JSON.stringify({ id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload });
}
