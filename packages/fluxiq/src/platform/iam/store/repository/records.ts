import type { JsonObject } from "../../../../core/index.ts";
import type { IamRecordRepository } from "./record-repository.ts";

/**
 * Typed access to one store's rows in the repository. A row's id is
 * `<kind>/<key>` (just `<kind>` when the key is empty), its envelope kind is
 * `iam.<kind>`, and its scope is the workspace. Rows of other kinds or other
 * workspaces in the same repository are never returned.
 */
export class IamRecords {
  private readonly repository: IamRecordRepository;
  private readonly workspaceId: string | null;
  private readonly now: () => number;

  constructor(repository: IamRecordRepository, workspaceId: string | null, now: () => number) {
    this.repository = repository;
    this.workspaceId = workspaceId;
    this.now = now;
  }

  async get<T extends object>(kind: string, key: string): Promise<T | null> {
    const envelope = await this.repository.get(this.id(kind, key), { domainId: this.workspaceId });
    if (envelope === null || envelope.kind !== `iam.${kind}`) return null;
    return envelope.data as unknown as T;
  }

  async put(kind: string, key: string, data: object): Promise<void> {
    const id = this.id(kind, key);
    const scope = { domainId: this.workspaceId };
    const existing = await this.repository.get(id, scope);
    const nowMs = this.now();
    await this.repository.put({
      id,
      scope,
      kind: `iam.${kind}`,
      data: data as unknown as JsonObject,
      createdAtMs: existing?.createdAtMs ?? nowMs,
      updatedAtMs: nowMs
    });
  }

  async remove(kind: string, key: string): Promise<boolean> {
    return this.repository.delete(this.id(kind, key), { domainId: this.workspaceId });
  }

  async list<T extends object>(kind: string): Promise<T[]> {
    const envelopes = await this.repository.list({ domainId: this.workspaceId });
    const own = envelopes.filter((envelope) => envelope.kind === `iam.${kind}` && (envelope.scope.domainId ?? null) === this.workspaceId);
    return own.map((envelope) => envelope.data as unknown as T);
  }

  private id(kind: string, key: string): string {
    return key === "" ? kind : `${kind}/${key}`;
  }
}
