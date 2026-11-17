// @fluxiq-test-group real-sql
// Covers conversation-relay.ts and authority.ts (its conversation read authority, through paired-read.ts) with the
// client gateway's conversation delivery, through real runtimes on the hosted (`service`) IAM profile, deciding by a
// real IAM store:
// - a project chat's committed change reaches its own runtime's gateway only: one process runs a runtime per tenant,
//   and another tenant's gateway is never handed it;
// - a paired browser is told only of chats its person may read, as `get-conversation` decides it for them on the
//   paired-client channel, focused or not: never another person's project under the owner condition, never a person
//   with no policy;
// - the decision is made once and reused, with no audit row, until the IAM store changes, and the message carries the
//   chat's id and project alone.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewaySocket } from "../../../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../../../framework/index.ts";
import type { IamAuditRecord, IamAuditSink } from "../../../../../platform/iam/index.ts";
import { resolveIamPredefinedPolicy } from "../../../../../platform/iam/predefined/index.ts";
import { IamStore, type IamRecordEnvelope, type IamRecordRepository, type IamRecordScope } from "../../../../../platform/iam/store/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../../index.ts";
import type { ProgramApiActor } from "../../../../_shared/api.ts";

const DOMAIN = "example";
const WORKSPACE = "workspace-main";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const ALICE = { userId: "alice", sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;
const BOB = { ...ALICE, userId: "bob", sessionId: "panel:bob" } satisfies ProgramApiActor;
const CAROL = { ...ALICE, userId: "carol", sessionId: "panel:carol" } satisfies ProgramApiActor;
const CHANGE = { actor: `frn:fluxiq:iam:${WORKSPACE}:user/admin`, origin: "panel", requestId: "request.test" } as const;
const READ_CHAT = "studio:GetConversation";

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

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("a paired browser is told which chats it may read changed, scoped to its tenant and its person's access", () => {
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

  /** A tenant's runtime deciding by its own IAM store, in which Alice and Bob hold `FluxIQUserAccess` and Carol nothing. */
  const tenant = async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-conversation-push-"));
    roots.push(root);
    const store = new IamStore({ workspaceId: WORKSPACE, repository: new MemoryRepository(), resolveManagedPolicy: resolveIamPredefinedPolicy });
    const alice = store.principalFrn("user", ALICE.userId);
    await store.attachPolicy(alice, "FluxIQUserAccess", CHANGE);
    await store.attachPolicy(store.principalFrn("user", BOB.userId), "FluxIQUserAccess", CHANGE);
    const audit = new RecordingAudit();
    const runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", workspaceId: WORKSPACE, source: store, audit } });
    runtimes.push(runtime);
    for (const person of [ALICE, BOB, CAROL]) await runtime.identityAccess.upsertUser({ id: person.userId, username: person.userId, displayName: person.userId, roleId: "viewer" });
    return { runtime, store, alice, audit };
  };
  /** A project made by `owner`'s own login, so the registry records who owns it. */
  const made = async (runtime: GlobalProgramRuntime, owner: ProgramApiActor, name: string): Promise<string> => {
    const answer = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId: DOMAIN }, actor: owner, payload: { name } }) as { ok: boolean; error?: string; payload?: { project?: { id: string } } };
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };
  /** A browser `person` paired, focused on no project. */
  const pairedBrowser = async (runtime: GlobalProgramRuntime, person: ProgramApiActor) => {
    const gateway = runtime.clientGateway;
    const socket = new RecordingSocket();
    const { sessionId } = gateway.connect({ socket });
    await gateway.receiveRaw(sessionId, envelope("client.hello", { clientId: `extension.${person.userId}`, clientType: "extension", name: "Browser", capabilities: [], metadata: { domainId: DOMAIN } }));
    const pairing = gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === sessionId);
    expect((await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: person.userId }))?.status).toBe("ready");
    return { changed: () => socket.sent.filter((sent) => sent.type === "server.conversation_changed").map((sent) => sent.payload) };
  };
  /** Opens a chat in `projectId`, as a person's New chat does; the write signals once it commits. */
  const opened = async (runtime: GlobalProgramRuntime, projectId: string): Promise<string> =>
    (await runtime.automationStudio.conversations.openConversation({ projectId, subject: { kind: "project", id: projectId }, title: null, fresh: true })).conversationId;

  it("hands a project chat's change to its own tenant's gateway only", async () => {
    const first = await tenant();
    const second = await tenant();
    const own = await made(first.runtime, ALICE, "Own");
    const firstBrowser = await pairedBrowser(first.runtime, ALICE);
    const secondBrowser = await pairedBrowser(second.runtime, ALICE);
    const secondPublished = vi.spyOn(second.runtime.clientGateway.conversationPush, "publish");

    const conversationId = await opened(first.runtime, own);
    await vi.waitFor(() => expect(firstBrowser.changed()).toEqual([{ conversationId, projectId: own }]));
    await settle();

    expect(secondPublished).not.toHaveBeenCalled();
    expect(secondBrowser.changed()).toEqual([]);
  });

  it("tells each person only of the chats they may read: never another person's project, never a person with no policy", async () => {
    const { runtime } = await tenant();
    const alices = await made(runtime, ALICE, "Alice's");
    const bobs = await made(runtime, BOB, "Bob's");
    const alice = await pairedBrowser(runtime, ALICE);
    const bob = await pairedBrowser(runtime, BOB);
    const carol = await pairedBrowser(runtime, CAROL);

    const inAlices = await opened(runtime, alices);
    const inBobs = await opened(runtime, bobs);
    await vi.waitFor(() => expect(bob.changed()).toHaveLength(1));
    await vi.waitFor(() => expect(alice.changed()).toHaveLength(1));
    await settle();

    expect(alice.changed()).toEqual([{ conversationId: inAlices, projectId: alices }]);
    expect(bob.changed()).toEqual([{ conversationId: inBobs, projectId: bobs }]);
    expect(carol.changed()).toEqual([]);
  });

  it("decides once and reuses it with no audit row, forgets it when the IAM store changes, and reads again once restored", async () => {
    const { runtime, store, alice: alicePrincipal, audit } = await tenant();
    const own = await made(runtime, ALICE, "Own");
    const alice = await pairedBrowser(runtime, ALICE);
    const decided = vi.spyOn(runtime.api, "decideUnrecorded");
    const chatDecisions = () => decided.mock.calls.filter(([input]) => input.action === READ_CHAT).length;
    const rowsBefore = audit.records.length;

    const first = await opened(runtime, own);
    const second = await opened(runtime, own);
    await vi.waitFor(() => expect(alice.changed().map((change) => change.conversationId)).toEqual([first, second]));
    expect(chatDecisions()).toBe(1);
    expect(audit.records.length).toBe(rowsBefore);
    // The chat's id and project, nothing it says.
    expect(Object.keys(alice.changed()[0]).sort()).toEqual(["conversationId", "projectId"]);

    await store.detachPolicy(alicePrincipal, "FluxIQUserAccess", CHANGE);
    await opened(runtime, own);
    await vi.waitFor(() => expect(chatDecisions()).toBe(2));
    await settle();
    expect(alice.changed()).toHaveLength(2);

    await store.attachPolicy(alicePrincipal, "FluxIQUserAccess", CHANGE);
    const restored = await opened(runtime, own);
    await vi.waitFor(() => expect(alice.changed().at(-1)).toEqual({ conversationId: restored, projectId: own }));
    expect(chatDecisions()).toBe(3);
  });
});

/** A client message as its socket's text. */
function envelope(type: string, payload: unknown): string {
  return JSON.stringify({ id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload });
}
