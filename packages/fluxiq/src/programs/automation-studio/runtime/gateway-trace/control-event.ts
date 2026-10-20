// A control event as the trace sink takes it (D1): an input that reached Core
// outside the client gateway's socket, on the control stream, as JSON, with
// only the correlations the caller knows. The screening sink screens it like
// any other event.

import type { ClientGatewayTraceEventInput } from "../../../../client-gateway/index.ts";
import { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL } from "./control-vocabulary.ts";
import type { AutomationStudioGatewayTraceControlEvent } from "./types.ts";

/** The sink input for `event`, referencing the artifact it arrived with when one was recorded. */
export function automationStudioGatewayTraceControlInput(event: AutomationStudioGatewayTraceControlEvent, artifactIds: readonly string[]): ClientGatewayTraceEventInput {
  return {
    stream: AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL.stream,
    kind: "control",
    messageType: `control.${event.type}`,
    source: { id: null, sequence: null, timestamp: null },
    correlation: {
      commandId: event.correlation?.commandId ?? null,
      recordingId: event.correlation?.recordingId ?? null,
      causationEventId: event.correlation?.causationEventId ?? null,
      owner: null,
      observationRevision: null,
      baseRevision: null
    },
    payloadSchema: { name: `automation-studio.control.${event.type}`, version: "1" },
    payload: { encoding: "json", value: event.payload },
    artifactIds,
    redactions: []
  };
}
