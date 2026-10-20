// The screening sink (D15): the sink the client gateway and the control
// ingress record through, screening each event's payload for secrets before
// the trace takes its copy. The gateway cannot import the program's screen
// (the dependency points the other way), so the program hands the gateway this
// sink instead of the recorder. Synchronous, like the recorder: the screen is a
// regex walk. Artifacts are bytes and pass through unscreened; credentials the
// protocol names are the gateway tap's own redaction (D7) and arrive here
// already withheld, their redactions kept beside any this sink adds.

import type {
  ClientGatewayTraceArtifactInput,
  ClientGatewayTraceCheckpointInput,
  ClientGatewayTraceCheckpointResult,
  ClientGatewayTraceCloseInput,
  ClientGatewayTraceEventInput,
  ClientGatewayTraceManifest,
  ClientGatewayTraceRecordResult,
  ClientGatewayTraceSink,
  ClientGatewayTraceSinkStatus
} from "../../../../client-gateway/index.ts";
import { screenAutomationStudioGatewayTracePayload } from "./payload-screen.ts";

/** What is stored when the screen itself fails: the whole payload withheld, never the raw value. */
const UNSCREENED = Object.freeze({ encoding: "json" as const, value: "[withheld: unscreened]" });

export class AutomationStudioGatewayTraceScreeningSink implements ClientGatewayTraceSink {
  private readonly inner: ClientGatewayTraceSink;

  constructor(inner: ClientGatewayTraceSink) {
    this.inner = inner;
  }

  record(input: ClientGatewayTraceEventInput): ClientGatewayTraceRecordResult {
    let screened: ReturnType<typeof screenAutomationStudioGatewayTracePayload>;
    try {
      screened = screenAutomationStudioGatewayTracePayload(input.payload);
    } catch {
      // The sink never throws into the gateway, and an unscreened payload is never stored.
      screened = { payload: UNSCREENED, redactions: [{ path: "", reason: "secret" }] };
    }
    if (screened.redactions.length === 0) return this.inner.record(input);
    // A copy of the event with only its payload and redactions replaced, so the
    // session reference, the digests and any field added to the event later all
    // survive a redaction (D21).
    return this.inner.record({ ...input, payload: screened.payload, redactions: [...input.redactions, ...screened.redactions] });
  }

  recordArtifact(input: ClientGatewayTraceArtifactInput): ClientGatewayTraceRecordResult {
    return this.inner.recordArtifact(input);
  }

  markCheckpoint(input: ClientGatewayTraceCheckpointInput): ClientGatewayTraceCheckpointResult {
    return this.inner.markCheckpoint(input);
  }

  flush(): Promise<void> {
    return this.inner.flush();
  }

  close(input: ClientGatewayTraceCloseInput): Promise<ClientGatewayTraceManifest> {
    return this.inner.close(input);
  }

  status(): ClientGatewayTraceSinkStatus {
    return this.inner.status();
  }
}
