import { IamDecisionAuditFilter, iamReadActionsOf, type IamAuditSink } from "fluxiq/platform";
import type { GlobalProgramApiRegistry } from "fluxiq";
import { appRouteReadActions } from "../app-route-iam";

/**
 * The registry decisions every workspace persists, on every profile: each
 * allowed decision of an action that changes state and every refusal (a
 * refused read included), so Activity shows who changed what and every
 * refused attempt. Allowed reads are dropped (`IamDecisionAuditFilter`).
 *
 * The reads are the app routes' `GET` actions, known now, and each opened
 * instance's registered Read and List actions (`learn`). Until an instance is
 * learned an allowed decision of its actions is kept, never dropped. `sink` is
 * what each workspace's `iam.audit` records into; it hands the kept rows to
 * `target` (the platform's buffered sink, through the deferred one), so a
 * request never waits for storage.
 */
export class WorkspaceDecisionAudit {
  readonly sink: IamAuditSink;
  private readonly reads = new Set<string>(appRouteReadActions());

  constructor(target: IamAuditSink) {
    this.sink = new IamDecisionAuditFilter(target, (action) => this.reads.has(action));
  }

  /** Adds the Read and List actions an instance's registry declares. */
  learn(registry: Pick<GlobalProgramApiRegistry, "endpoints">): void {
    for (const action of iamReadActionsOf(registry.endpoints())) this.reads.add(action);
  }
}
