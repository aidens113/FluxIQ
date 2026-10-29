import type { IamAuditRecord, IamAuditSink } from "../../types.ts";

export class RecordingSink implements IamAuditSink {
  readonly records: IamAuditRecord[] = [];
  record(record: IamAuditRecord): void {
    this.records.push(record);
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}
