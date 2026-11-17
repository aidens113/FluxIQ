import type { FluxIQ } from "fluxiq";
import type { IamAuditQuery, IamAuditRecord, PlatformStore } from "fluxiq/platform";

/** Every workspace lookup is bound by the owner, not supplied by the caller. */
export type AccountReadStore = {
  getAccount(userId: string): ReturnType<PlatformStore["getAccount"]>;
  getMembership(userId: string): ReturnType<PlatformStore["getMembership"]>;
  getWorkspace(): ReturnType<PlatformStore["getWorkspace"]>;
  listMemberships(): ReturnType<PlatformStore["listMembershipsOfWorkspace"]>;
};
export type AccountAuditReader = { read(query: IamAuditQuery): Promise<IamAuditRecord[]> };
export type WorkspaceAccountReadContext = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly tenancy: "single" | "multi";
  readonly profile: "local" | "self-hosted" | "service";
  readonly store: Readonly<AccountReadStore>;
  readonly identityAccess: Readonly<Pick<FluxIQ["programs"]["identityAccess"], "snapshot">>;
  audit(): Promise<AccountAuditReader>;
};
export type AccountReadAnswer = { readonly status: 200 | 400; readonly body: unknown };
export type AccountReadWork = (context: WorkspaceAccountReadContext) => AccountReadAnswer | Promise<AccountReadAnswer>;
