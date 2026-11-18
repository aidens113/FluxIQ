// @fluxiq-test-group real-sql
// Covers authority.ts through the real runtime: its client gateway, registry and store on the hosted (`service`) IAM
// profile. A browser Alice paired moves to her own project and hears its activity; Bob's project, her project in
// another domain, one that does not exist, and any project once she is disabled are refused, and the session stays
// where it was.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActivity, type ClientGatewaySocket } from "../../../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../../../framework/index.ts";
import { IAM_USER_ACCESS } from "../../../../../platform/iam/predefined/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../../index.ts";
import type { ProgramApiActor } from "../../../../_shared/api.ts";
import { fixedPolicySource } from "../../../../_shared/tests/iam-registry-fixtures.ts";

const DOMAIN = "example";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const ALICE = { userId: "user.alice", sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;
const BOB = { ...ALICE, userId: "user.bob", sessionId: "panel:bob" } satisfies ProgramApiActor;

// The plain data-directory layout, as the handler suites' disposable runtime takes it (no provisioned workspace).
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
  readonly sent: Array<{ type: string; correlationId?: string; payload: any }> = [];
  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }
}

describe("a paired browser's project focus, decided through the runtime's IAM", () => {
  let root = "";
  let runtime: GlobalProgramRuntime;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-focus-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) } });
    await runtime.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    await runtime.identityAccess.upsertUser({ id: BOB.userId, username: "bob", displayName: "Bob", roleId: "viewer" });
  });
  afterEach(async () => {
    runtime.secretKeys.close();
    runtime.detach();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  // A project made by its owner's own login, so the registry records who owns it.
  const made = async (actor: ProgramApiActor, name: string, domainId: string = DOMAIN): Promise<string> => {
    const answer = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId }, actor, payload: { name } }) as { ok: boolean; error?: string; payload?: { project?: { id: string } } };
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };
  // A browser that declared DOMAIN and the activity capability, approved by Alice.
  const pairedBrowser = async () => {
    const gateway = runtime.clientGateway;
    const socket = new RecordingSocket();
    const { sessionId } = gateway.connect({ socket });
    await gateway.receiveRaw(sessionId, envelope("client.hello", { clientId: "extension.alice", clientType: "extension", name: "Alice's browser", capabilities: [{ id: CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, kind: "state" }], metadata: { domainId: DOMAIN } }));
    const pairing = gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === sessionId);
    expect((await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: ALICE.userId }))?.status).toBe("ready");
    const focus = async (projectId: string | null) => {
      await gateway.receiveRaw(sessionId, envelope("client.focus_project", { projectId }));
      return socket.sent.at(-1);
    };
    const projectId = () => gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.projectId ?? null;
    return { socket, focus, projectId };
  };

  it("moves the session to the person's own project, whose activity then reaches it while another project's does not", async () => {
    const own = await made(ALICE, "Own");
    const second = await made(ALICE, "Second");
    const browser = await pairedBrowser();
    await browser.focus(own);

    expect(await browser.focus(second)).toEqual(expect.objectContaining({ type: "server.project_focused", payload: { projectId: second } }));
    expect(browser.projectId()).toBe(second);
    expect(runtime.clientGateway.publishActivity(activity(own), { projectId: own })).toBe(0);
    expect(runtime.clientGateway.publishActivity(activity(second), { projectId: second })).toBe(1);
  });

  it("refuses another person's project, the person's own in another domain, and one that does not exist", async () => {
    const own = await made(ALICE, "Own");
    const bobs = await made(BOB, "Bob's");
    const elsewhere = await made(ALICE, "Elsewhere", "other-domain");
    const browser = await pairedBrowser();
    await browser.focus(own);

    for (const projectId of [bobs, elsewhere, "project.missing"]) {
      expect(await browser.focus(projectId), projectId).toEqual(expect.objectContaining({ type: "server.error", payload: expect.objectContaining({ code: CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.refused }) }));
      expect(browser.projectId()).toBe(own);
    }
    expect(runtime.clientGateway.publishActivity(activity(bobs), { projectId: bobs })).toBe(0);
  });

  it("refuses every project once the approving person is disabled", async () => {
    const own = await made(ALICE, "Own");
    const browser = await pairedBrowser();
    await runtime.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer", enabled: false });

    expect((await browser.focus(own))?.payload.code).toBe(CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.refused);
    expect(browser.projectId()).toBeNull();
  });
});

function activity(projectId: string): ClientGatewayActivity {
  return { activityId: "build.1", sequence: 1, subject: { kind: "build", id: "build.1", projectId }, phase: "running", label: "Running", at: "2026-11-16T00:00:00.000Z" };
}

/** A client message as its socket's text. */
function envelope(type: string, payload: unknown): string {
  return JSON.stringify({ id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload });
}
