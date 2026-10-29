import type { IamAuditSink, IamPolicy } from "../../types.ts";
import type { IamRecordRepository } from "../repository/index.ts";

/**
 * What an `IamStore` needs. `workspaceId` is null for the platform level.
 * `resolveManagedPolicy` is the predefined-policy lookup the caller supplies;
 * it is consulted before customer-managed policies.
 */
export type IamStoreOptions = {
  workspaceId: string | null;
  repository: IamRecordRepository;
  resolveManagedPolicy(name: string): IamPolicy | null;
  auditSink?: IamAuditSink | undefined;
  now?: (() => number) | undefined;
};
