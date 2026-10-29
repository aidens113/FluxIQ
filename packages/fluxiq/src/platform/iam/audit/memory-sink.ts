import type { IamAuditRecord, IamAuditSink } from "../types.ts";

/** An in-memory `IamAuditSink` for development and tests; keeps every record in arrival order. */
export class MemoryIamAuditSink implements IamAuditSink {
  private readonly kept: IamAuditRecord[] = [];

  get records(): readonly IamAuditRecord[] {
    return this.kept;
  }

  record(record: IamAuditRecord): void {
    this.kept.push(record);
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
