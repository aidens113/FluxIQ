import type { ExecutionOriginRecord } from "./origin.ts";

export interface ExecutionEntryRow {
  readonly entryId: string;
  readonly scopeId: string;
  readonly rootId: string;
  readonly parentId?: string;
  readonly resourceKeys: readonly string[];
  readonly sourceKey: string;
  readonly seriesKey?: string;
  readonly origin: ExecutionOriginRecord;
  readonly ownerIncarnation: string;
}
