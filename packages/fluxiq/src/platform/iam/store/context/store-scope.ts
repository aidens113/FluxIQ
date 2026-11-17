import { formatFluxIQResourceName, type IamPrincipalType } from "@fluxiq/contracts/iam";
import type { IamAuditSink, IamPolicy } from "../../types.ts";
import { IamRecords } from "../repository/index.ts";
import type { IamChangeContext } from "./change-context.ts";
import { emitIamChange } from "./emit-change.ts";
import { iamStoreChanges } from "./announced-changes.ts";
import type { IamStoreOptions } from "./store-options.ts";

/**
 * What every collaborator of the IAM store shares: the workspace, the typed
 * record access, the clock, the managed-policy lookup, and the audit trail.
 */
export class IamStoreScope {
  readonly workspaceId: string | null;
  readonly records: IamRecords;
  readonly now: () => number;
  readonly resolveManagedPolicy: (name: string) => IamPolicy | null;
  private readonly auditSink: IamAuditSink | undefined;

  constructor(options: IamStoreOptions) {
    this.workspaceId = options.workspaceId;
    this.now = options.now ?? Date.now;
    this.records = new IamRecords(options.repository, options.workspaceId, this.now);
    this.resolveManagedPolicy = (name) => options.resolveManagedPolicy(name);
    this.auditSink = options.auditSink;
  }

  /** The FRN of a principal of this store (`frn:fluxiq:iam:<workspaceId>:<type>/<id>`). */
  principalFrn(type: IamPrincipalType, id: string): string {
    return formatFluxIQResourceName({ service: "iam", workspaceId: this.workspaceId, resourceType: type, resourceId: id });
  }

  policyFrn(name: string): string {
    return formatFluxIQResourceName({ service: "iam", workspaceId: this.workspaceId, resourceType: "policy", resourceId: name });
  }

  /** Records a write that succeeded, and announces it to whoever holds decisions made from this store (`./announced-changes.ts`). */
  audit(context: IamChangeContext, action: string, resources: readonly string[]): void {
    emitIamChange(this.auditSink, this.now(), context, action, resources);
    iamStoreChanges.announce(this.workspaceId);
  }
}
