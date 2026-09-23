import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioBootstrapAuditEvent } from "../../flow-bootstrap/index.ts";

// The audit event a Flow Bootstrap adaptation records as it moves between
// statuses.

export function bootstrapAdaptationAuditEvent(input: {
  adaptationId: string;
  eventType: AutomationStudioBootstrapAuditEvent["eventType"];
  actorId: string | null;
  fromStatus: AutomationStudioBootstrapAuditEvent["fromStatus"];
  toStatus: AutomationStudioBootstrapAuditEvent["toStatus"];
  createdAt: number;
  detail?: JsonObject;
}): AutomationStudioBootstrapAuditEvent {
  const reason = input.eventType === "created"
    ? "Flow Bootstrap adaptation recorded."
    : input.eventType === "approved"
      ? "Flow Bootstrap adaptation approved for application."
      : input.eventType === "rejected"
        ? "Flow Bootstrap adaptation rejected by reviewer."
        : input.eventType === "applied"
          ? "Flow Bootstrap topology applied."
          : "Flow Bootstrap topology reverted.";
  return {
    eventId: `adaptation.audit.${input.adaptationId}.${input.eventType}`,
    adaptationId: input.adaptationId,
    eventType: input.eventType,
    actorId: input.actorId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reason,
    detail: { adaptationKind: "flow_bootstrap", ...(input.detail ?? {}) },
    detailObjectId: null,
    createdAt: input.createdAt
  };
}
