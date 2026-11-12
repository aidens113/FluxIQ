import type { IamAuditRecord, IamAuditSink } from "../types.ts";

/**
 * The decision audit a registry records into: who changed what, and every
 * refused attempt. In front of the persistent sink, it keeps every `deny`
 * (a refused read included), every `iam-change`, and every `allow` of an
 * action that changes state; it drops the `allow` of a read (`isRead`), which
 * would otherwise write a row for every page refresh and say nothing about
 * who changed what.
 *
 * `record` never awaits and never throws, as the registry needs: an `isRead`
 * that throws keeps the row, so a fault records more, never less. A record
 * is passed on as it came, field for field.
 */
export class IamDecisionAuditFilter implements IamAuditSink {
  constructor(
    private readonly target: IamAuditSink,
    private readonly isRead: (action: string) => boolean
  ) {}

  record(record: IamAuditRecord): void {
    if (record.category === "allow" && this.readOnly(record.action)) return;
    this.target.record(record);
  }

  flush(): Promise<void> {
    return this.target.flush();
  }

  private readOnly(action: string): boolean {
    try {
      return this.isRead(action) === true;
    } catch {
      return false;
    }
  }
}
