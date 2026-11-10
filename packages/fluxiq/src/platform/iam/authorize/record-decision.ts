import { iamIpPrefix } from "../audit/index.ts";
import type { IamAuditSink, IamDecision, IamRequestContext } from "../types.ts";

/**
 * Records one decision as one audit row: category `allow` or `deny`, time in
 * epoch seconds, the resources' FRNs, the deciding statement, and the caller's
 * address truncated, and who acted for the principal and how the person
 * consented, when the context says. A sink that throws propagates: the caller sees an error,
 * which is never an allow.
 */
export function recordIamDecision(sink: IamAuditSink, decision: IamDecision, context: IamRequestContext, requestId: string): void {
  sink.record({
    category: decision.decision,
    time: Math.floor(context.currentTimeMs / 1000),
    requestId,
    principal: decision.principal,
    action: decision.action,
    resources: decision.resources.map((resource) => resource.resource),
    decision: decision.decision,
    matched: decision.matched,
    origin: context.origin,
    ipPrefix: iamIpPrefix(context.sourceIp),
    ...(context.via === undefined ? {} : { via: context.via }),
    ...(context.consent === undefined ? {} : { consent: context.consent })
  });
}
