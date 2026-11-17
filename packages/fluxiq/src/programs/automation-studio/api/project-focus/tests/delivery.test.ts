// @fluxiq-test-group real-sql
// Covers own-project-activity.ts and authority.ts with the client gateway's activity delivery, through real runtimes on
// the hosted (`service`) IAM profile, deciding by a real IAM store:
// - one process runs a runtime per tenant, and the process-wide activity hub hands each runtime's gateway only its own
//   projects' activity, so another tenant's never reaches its delivery at all;
// - a paired browser's access to its project is decided once (by its focus) and reused for every activity, with no
//   audit row, until what it was decided from changes;
// - detaching the person's policy in the IAM store, disabling the person, or deleting the project ends that project's
//   activity at the change itself, and the browser is told with `server.project_access_ended`.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewaySocket } from "../../../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../../../framework/index.ts";
import type { IamAuditRecord, IamAuditSink } from "../../../../../platform/iam/index.ts";
import { resolveIamPredefinedPolicy } from "../../../../../platform/iam/predefined/index.ts";
import { IamStore, type IamRecordEnvelope, type IamRecordRepository, type IamRecordScope } from "../../../../../platform/iam/store/index.ts";
import { automationStudioActivityHub } from "../../../../../runtime/activity/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../../index.ts";
import type { ProgramApiActor } from "../../../../_shared/api.ts";

const DOMAIN = "example";
const WORKSPACE = "workspace-main";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const ALICE = { userId: "alice", sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;
const CHANGE = { actor: `frn:fluxiq:iam:${WORKSPACE}:user/admin`, origin: "panel", requestId: "request.test" } as const;

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

/** The IAM store's records, in memory. */
class MemoryRepository implements IamRecordRepository {
  private readonly rows = new Map<string, IamRecordEnvelope>();
  private key(id: string, scope?: IamRecordScope): string {
    return `${scope?.domainId ?? ""}|${id}`;
  }
  async list(scope?: IamRecordScope): Promise<IamRecordEnvelope[]> {
    return [...this.rows.values()].filter((row) => (row.scope.domainId ?? null) === (scope?.domainId ?? null));
  }
  async get(id: string, scope?: IamRecordScope): Promise<IamRecordEnvelope | null> {
    return this.rows.get(this.key(id, scope)) ?? null;
  }
  async put(record: IamRecordEnvelope): Promise<IamRecordEnvelope> {
    this.rows.set(this.key(record.id, record.scope), structuredClone(record));
    return record;
  }
  async delete(id: string, scope?: IamRecordScope): Promise<boolean> {
    return this.rows.delete(this.key(id, scope));
  }
}

/** Every registry decision row, as a host's audit would keep it. */
class RecordingAudit implements IamAuditSink {
  readonly records: IamAuditRecord[] = [];
  record(record: IamAuditRecord): void {
    this.records.push(record);
  }
  async flush(): Promise<void> {}
}

describe("a paired browser's activity, scoped to its tenant and to its person's access as it changes", () => {
  const roots: string[] = [];
  const runtimes: GlobalProgramRuntime[] = [];

  afterEach(async () => {
    // Closed as an instance closes its runtime (`FluxIQ.close`), so no SQLite file stays open under `rm`.
    for (const runtime of runtimes.splice(0)) {
      runtime.detach();
      await runtime.clientGateway.close();
      await runtime.automationStudio.close();
      runtime.secretKeys.close();
    }
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  /** A tenant's runtime deciding by its own IAM store, in which Alice holds `FluxIQUserAccess`. */
  const tenant = async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-delivery-"));
    roots.push(root);
    const store = new IamStore({ workspaceId: WORKSPACE, repository: new MemoryRepository(), resolveManagedPolicy: resolveIamPredefinedPolicy });
    const alice = store.principalFrn("user", ALICE.userId);
    await store.attachPolicy(alice, "FluxIQUserAccess", CHANGE);
    const audit = new RecordingAudit();
    const runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", workspaceId: WORKSPACE, source: store, audit } });
    runtimes.push(runtime);
    await runtime.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    return { runtime, store, alice, audit };
  };
  const made = async (runtime: GlobalProgramRuntime, name: string): Promise<string> => {
    const answer = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId: DOMAIN }, actor: ALICE, payload: { name } }) as { ok: boolean; error?: string; payload?: { project?: { id: string } } };
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };
  /** A browser Alice paired, focused on `projectId`. */
  const pairedBrowser = async (runtime: GlobalProgramRuntime, projectId: string) => {
    const gateway = runtime.clientGateway;
    const socket = new RecordingSocket();
    const { sessionId } = gateway.connect({ socket });
    await gateway.receiveRaw(sessionId, envelope("client.hello", { clientId: "extension.alice", clientType: "extension", name: "Alice's browser", capabilities: [{ id: CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, kind: "state" }], metadata: { domainId: DOMAIN } }));
    const pairing = gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === sessionId);
    expect((await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: ALICE.userId }))?.status).toBe("ready");
    await gateway.receiveRaw(sessionId, envelope("client.focus_project", { projectId }));
    expect(socket.sent.at(-1)?.type).toBe("server.project_focused");
    return {
      activity: () => socket.sent.filter((sent) => sent.type === "server.activity").map((sent) => sent.payload.sequence as number),
      ended: () => socket.sent.filter((sent) => sent.type === "server.project_access_ended").map((sent) => sent.payload),
      projectId: () => gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.projectId ?? null
    };
  };
  /** One activity of `projectId` on the process-wide hub, as a build emits it; answers its hub sequence. */
  const emit = (projectId: string): number => automationStudioActivityHub.publish({ activityId: "build:build.1", subject: { kind: "build", id: "build.1", projectId }, phase: "running", label: "Running" }).sequence;

  it("hands each tenant's gateway only its own projects' activity", async () => {
    const first = await tenant();
    const second = await tenant();
    const own = await made(first.runtime, "Own");
    const firstPublished = vi.spyOn(first.runtime.clientGateway, "publishActivity");
    const secondPublished = vi.spyOn(second.runtime.clientGateway, "publishActivity");

    emit(own);
    emit(own);
    await vi.waitFor(() => expect(firstPublished).toHaveBeenCalledTimes(2));

    expect(secondPublished).not.toHaveBeenCalled();
  });

  it("decides once for the focus and reuses it for every activity, writing no audit row", async () => {
    const { runtime, audit } = await tenant();
    const own = await made(runtime, "Own");
    const decided = vi.spyOn(runtime.api, "decideUnrecorded");
    const rowsBefore = audit.records.length;
    const browser = await pairedBrowser(runtime, own);

    const sequences = [emit(own), emit(own), emit(own), emit(own), emit(own)];
    await vi.waitFor(() => expect(browser.activity()).toEqual(sequences));

    expect(decided).toHaveBeenCalledTimes(1);
    expect(audit.records.length).toBe(rowsBefore);
  });

  it("ends the project's activity at the change when the person's policy is detached in the IAM store", async () => {
    const { runtime, store, alice } = await tenant();
    const own = await made(runtime, "Own");
    const browser = await pairedBrowser(runtime, own);
    const delivered = emit(own);
    await vi.waitFor(() => expect(browser.activity()).toEqual([delivered]));

    await store.detachPolicy(alice, "FluxIQUserAccess", CHANGE);

    await vi.waitFor(() => expect(browser.ended()).toEqual([expect.objectContaining({ projectId: own, currentProjectId: null })]));
    expect(browser.projectId()).toBeNull();
    emit(own);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(browser.activity()).toEqual([delivered]);
  });

  it("ends the project's activity at the change when the person is disabled", async () => {
    const { runtime } = await tenant();
    const own = await made(runtime, "Own");
    const browser = await pairedBrowser(runtime, own);

    await runtime.identityAccess.updateUser({ id: ALICE.userId, enabled: false });

    await vi.waitFor(() => expect(browser.ended()).toEqual([expect.objectContaining({ projectId: own, currentProjectId: null })]));
    emit(own);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(browser.activity()).toEqual([]);
  });

  it("ends the project's activity at the change when the project is deleted", async () => {
    const { runtime } = await tenant();
    const own = await made(runtime, "Own");
    const browser = await pairedBrowser(runtime, own);

    await runtime.automationStudio.deleteProject(own);

    await vi.waitFor(() => expect(browser.ended()).toEqual([expect.objectContaining({ projectId: own, currentProjectId: null })]));
    emit(own);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(browser.activity()).toEqual([]);
  });
});

/** A client message as its socket's text. */
function envelope(type: string, payload: unknown): string {
  return JSON.stringify({ id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload });
}
