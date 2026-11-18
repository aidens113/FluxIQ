// Covers GlobalProgramApiRegistry.decideUnrecorded and subscribeDecisionChanges, with ProgramIamGate.subscribeChanges
// and IamRequestAuthorizer.decideUnrecorded behind them, on the `service` profile over a real IAM store: an unrecorded
// decision is the recorded one without its audit row, and a holder is told of each IAM store write in its workspace
// (or at the platform level), never of another workspace's.
import { afterEach, describe, expect, it } from "vitest";
import type { IamAuditRecord, IamAuditSink } from "../../../platform/iam/index.ts";
import { resolveIamPredefinedPolicy } from "../../../platform/iam/predefined/index.ts";
import { IamStore, iamStoreChanges, type IamRecordEnvelope, type IamRecordRepository, type IamRecordScope } from "../../../platform/iam/store/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../api.ts";

const WORKSPACE = "w1";
const CONTEXT = { actor: `frn:fluxiq:iam:${WORKSPACE}:user/admin`, origin: "panel", requestId: "request-1" } as const;
const ALICE: ProgramApiActor = { sessionId: "panel:alice", userId: "alice", roleId: "viewer", permissions: ["programs.read"], channel: "panel" };
const READ = { actor: ALICE, action: "studio:Projects", permission: "programs.read", resources: [{ kind: "workspace" }], programId: "automation-studio" } as const;

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

class RecordingAudit implements IamAuditSink {
  readonly records: IamAuditRecord[] = [];
  record(record: IamAuditRecord): void {
    this.records.push(record);
  }
  async flush(): Promise<void> {}
}

async function servicePieces() {
  const store = new IamStore({ workspaceId: WORKSPACE, repository: new MemoryRepository(), resolveManagedPolicy: resolveIamPredefinedPolicy });
  const audit = new RecordingAudit();
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "service", workspaceId: WORKSPACE, source: store, audit } });
  return { store, audit, registry, alice: store.principalFrn("user", "alice") };
}

describe("the registry's unrecorded decisions and its decision changes", () => {
  const stops: Array<() => void> = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });

  it("decides exactly as authorize does, without writing the audit row", async () => {
    const { store, audit, registry, alice } = await servicePieces();
    await store.attachPolicy(alice, "FluxIQUserAccess", CONTEXT);

    const recorded = await registry.authorize(READ);
    expect(audit.records).toHaveLength(1);
    const unrecorded = await registry.decideUnrecorded(READ);

    expect(audit.records).toHaveLength(1);
    expect(unrecorded.allowed).toBe(true);
    expect(unrecorded.decision).toEqual(recorded.decision);

    await store.detachPolicy(alice, "FluxIQUserAccess", CONTEXT);
    const refused = await registry.decideUnrecorded(READ);
    expect(refused.allowed).toBe(false);
    expect(refused.decision?.failure).toBeUndefined();
    expect(audit.records).toHaveLength(1);
  });

  it("tells a holder of each IAM store write in its workspace or at the platform level, never another workspace's, until it stops", async () => {
    const { store, registry, alice } = await servicePieces();
    let told = 0;
    const stop = registry.subscribeDecisionChanges(() => {
      told += 1;
    });
    stops.push(stop);

    await store.attachPolicy(alice, "FluxIQUserAccess", CONTEXT);
    iamStoreChanges.announce("another-workspace");
    iamStoreChanges.announce(null);
    expect(told).toBe(2);

    stop();
    await store.detachPolicy(alice, "FluxIQUserAccess", CONTEXT);
    expect(told).toBe(2);
  });
});
