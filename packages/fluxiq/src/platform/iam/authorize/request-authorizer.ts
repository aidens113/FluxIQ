import { evaluateIamRequest, type CompiledIamPolicySet } from "../evaluate/index.ts";
import type { IamAuditSink, IamDecision, IamPrincipal, IamRequestContext, IamResource } from "../types.ts";
import { denyIamRequest } from "./deny-decision.ts";
import { recordIamDecision } from "./record-decision.ts";

/**
 * An authorizer for one request: the policy set was gathered and compiled
 * once, and every decision shares the request id. With `compiled` null (the
 * policies could not be gathered) every decision is a recorded deny.
 */
export class IamRequestAuthorizer {
  constructor(
    private readonly compiled: CompiledIamPolicySet | null,
    private readonly principal: IamPrincipal,
    private readonly context: IamRequestContext,
    private readonly sink: IamAuditSink,
    private readonly requestId: string
  ) {}

  /** Decides `action` on `resources` and records exactly one audit row. */
  decide(action: string, resources: readonly IamResource[]): IamDecision {
    const decision = this.evaluate(action, resources);
    recordIamDecision(this.sink, decision, this.context, this.requestId);
    return decision;
  }

  /**
   * Keeps the items the principal may `action`, locating each by `toResource`.
   * When the principal has full access to the list scope and to every item,
   * one audit row names the list action and `listScope`; otherwise one row is
   * recorded per item and only allowed items are returned. An empty list
   * records the one row for `listScope`.
   */
  filter<T>(action: string, items: readonly T[], toResource: (item: T) => IamResource, listScope: IamResource): T[] {
    const scope = this.evaluate(action, [listScope]);
    const compiled = this.compiled;
    const covered = compiled !== null && scope.decision === "allow" && scope.fullAccess && items.every((item) => compiled.coveredByFullAccess(toResource(item).frn));
    if (covered || items.length === 0) {
      recordIamDecision(this.sink, scope, this.context, this.requestId);
      return scope.decision === "allow" ? [...items] : [];
    }
    return items.filter((item) => this.decide(action, [toResource(item)]).decision === "allow");
  }

  private evaluate(action: string, resources: readonly IamResource[]): IamDecision {
    if (this.compiled === null) return denyIamRequest(this.principal, action, resources);
    try {
      return evaluateIamRequest(this.compiled, this.principal, action, resources, this.context);
    } catch {
      return denyIamRequest(this.principal, action, resources);
    }
  }
}
