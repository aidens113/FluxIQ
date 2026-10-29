import type { JsonObject } from "../../../core/index.ts";
import type { PlatformRecordRepository } from "./platform-record-repository.ts";

const SCOPE = { domainId: null };

/**
 * Typed access to the platform rows in the repository. A row's id is
 * `<kind>/<key>`, its envelope kind is `platform.<kind>`, and its scope is
 * platform level (`domainId: null`). Nothing is cached between calls. A row's
 * kind is written but never relied on to tell kinds apart: `SQLiteRepository`
 * stores its own repository kind over the envelope's, so the id prefix is what
 * separates `account/...` from `email/...` rows.
 */
export class PlatformRecords {
  private readonly repository: PlatformRecordRepository;
  private readonly now: () => number;

  constructor(repository: PlatformRecordRepository, now: () => number) {
    this.repository = repository;
    this.now = now;
  }

  async get<T extends object>(kind: string, key: string): Promise<T | null> {
    const envelope = await this.repository.get(`${kind}/${key}`, SCOPE);
    return envelope === null ? null : (envelope.data as unknown as T);
  }

  async put(kind: string, key: string, data: object): Promise<void> {
    const id = `${kind}/${key}`;
    const existing = await this.repository.get(id, SCOPE);
    const nowMs = this.now();
    await this.repository.put({
      id,
      scope: { domainId: null },
      kind: `platform.${kind}`,
      data: data as unknown as JsonObject,
      createdAtMs: existing?.createdAtMs ?? nowMs,
      updatedAtMs: nowMs
    });
  }

  async remove(kind: string, key: string): Promise<boolean> {
    return this.repository.delete(`${kind}/${key}`, SCOPE);
  }

  async list<T extends object>(kind: string): Promise<T[]> {
    const envelopes = await this.repository.list(SCOPE);
    return envelopes
      .filter((envelope) => envelope.id.startsWith(`${kind}/`) && (envelope.scope.domainId ?? null) === null)
      .map((envelope) => envelope.data as unknown as T);
  }
}
