import type { JsonObject } from "../../../../core/index.ts";
import type { IamRecordRepository } from "./record-repository.ts";

/**
 * Typed access to one store's rows in the repository. A row's id is
 * `<kind>/<key>` (just `<kind>` when the key is empty) and its scope is the
 * workspace. Kinds are told apart by that id prefix alone: the envelope kind
 * `iam.<kind>` is still written, but a repository may store its own kind over
 * it (`SQLiteRepository` does), so it is never read back. Workspaces are kept
 * apart by the repository's scope (a database per workspace for SQLite), not by
 * comparing the scope a row comes back with, which a repository may normalise.
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
    const envelope = await this.repository.get(this.id(kind, key), this.scope());
    return envelope === null ? null : (envelope.data as unknown as T);
  }

  async put(kind: string, key: string, data: object): Promise<void> {
    const id = this.id(kind, key);
    const scope = this.scope();
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
    return this.repository.delete(this.id(kind, key), this.scope());
  }

  /** Every row of `kind` in this workspace: ids `<kind>` and `<kind>/...`, whatever kind the repository reports. */
  async list<T extends object>(kind: string): Promise<T[]> {
    const envelopes = await this.repository.list(this.scope());
    return envelopes.filter((envelope) => envelope.id === kind || envelope.id.startsWith(`${kind}/`)).map((envelope) => envelope.data as unknown as T);
  }

  private scope(): { domainId: string | null } {
    return { domainId: this.workspaceId };
  }

  private id(kind: string, key: string): string {
    return key === "" ? kind : `${kind}/${key}`;
  }
}
