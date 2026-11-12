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
   * Keeps the items the principal may `action`, locating each by `toResource`,
   * and records exactly one audit row for the list, naming `action` and
   * `listScope`:
   *
   * - when the principal has full access to the list scope and to every item,
   *   or the list is empty, the row is the scope's own decision, and every
   *   item is kept only when it allowed;
   * - otherwise each item is decided on its own and only the allowed ones are
   *   returned. The row is an `allow` when none was hidden, else one `deny`
   *   carrying `hidden`, how many were, with the statement that denied the
   *   first of them. A hidden item never gets a row of its own, so a list a
   *   caller can only partly see costs one row, not one per item.
   */
  filter<T>(action: string, items: readonly T[], toResource: (item: T) => IamResource, listScope: IamResource): T[] {
    const scope = this.evaluate(action, [listScope]);
    const compiled = this.compiled;
    const covered = compiled !== null && scope.decision === "allow" && scope.fullAccess && items.every((item) => compiled.coveredByFullAccess(toResource(item).frn));
    if (covered || items.length === 0) {
      recordIamDecision(this.sink, scope, this.context, this.requestId);
      return scope.decision === "allow" ? [...items] : [];
    }
    const decided = items.map((item) => ({ item, decision: this.evaluate(action, [toResource(item)]) }));
    const kept = decided.filter((entry) => entry.decision.decision === "allow");
    const hidden = decided.length - kept.length;
    recordIamDecision(this.sink, listDecision(action, listScope, decided.map((entry) => entry.decision)), this.context, this.requestId, hidden);
    return kept.map((entry) => entry.item);
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

/**
 * The one decision a list decided item by item is recorded as: on the list
 * scope, denied when any item was (citing the first denied item's statement
 * and reason), else allowed (citing the first item's). `items` is not empty.
 */
function listDecision(action: string, listScope: IamResource, items: readonly IamDecision[]): IamDecision {
  const citing = items.find((item) => item.decision === "deny") ?? items[0]!;
  const reason = citing.resources[0]?.reason ?? (citing.decision === "allow" ? "allowed" : "implicit-deny");
  return {
    principal: citing.principal,
    action,
    decision: citing.decision,
    matched: citing.matched,
    resources: [{ resource: listScope.frn, decision: citing.decision, reason, matched: citing.matched }],
    fullAccess: false
  };
}
