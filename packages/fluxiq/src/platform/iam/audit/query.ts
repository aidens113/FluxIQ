import type { IamAuditRecord } from "../types.ts";

/**
 * A read of the audit: every field is optional. `since` is inclusive and
 * `until` exclusive, both epoch seconds. Results are newest first, at most
 * `limit` (default 100).
 */
export type IamAuditQuery = {
  principal?: string;
  since?: number;
  until?: number;
  categories?: ReadonlyArray<IamAuditRecord["category"]>;
  limit?: number;
};
