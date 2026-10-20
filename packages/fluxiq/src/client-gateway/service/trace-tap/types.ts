// Types of the gateway-internal trace tap (traces and offline trials, P2):
// what it is built from, what an inbound capture hands back for its
// disposition, and what a trace artifact intake answers.

import type { ClientGatewayTraceCaptureSource, ClientGatewayTraceSink } from "../../trace/index.ts";

/** What the tap is built from. `source` unset: the tap does nothing at all. */
export type ClientGatewayTraceTapOptions = {
  source: ClientGatewayTraceCaptureSource | undefined;
  /** The client id a session currently speaks for, or `undefined` for an unknown session. */
  clientIdOf: (sessionId: string) => string | undefined;
};

/** One sink an inbound message was recorded into, and the event id it took there. */
export type ClientGatewayTraceInboundTarget = {
  readonly sink: ClientGatewayTraceSink;
  readonly eventId: string;
};

/** Where an inbound message went, so its disposition follows it to the same traces. */
export type ClientGatewayTraceInboundCapture = {
  readonly messageType: string | null;
  readonly commandId: string | null;
  readonly recordingId: string | null;
  readonly targets: readonly ClientGatewayTraceInboundTarget[];
};

/** What Core did with an inbound message, recorded after it was handled. */
export type ClientGatewayTraceDisposition = {
  disposition: string;
  /** The failure's message when handling threw; the socket host answers it with `gateway.receive_failed`. */
  error: string | null;
};

/** A trace artifact as a paired client uploads it: its claimed digest, its type and its bytes. */
export type ClientGatewayTraceArtifactUpload = {
  sha256: string;
  mediaType: string;
  bytes: Uint8Array;
};

/** How many open traces claiming the session took the artifact, or why it was refused. */
export type ClientGatewayTraceArtifactIntake =
  | { readonly status: "accepted"; readonly traces: number }
  | { readonly status: "refused"; readonly reason: "digest_mismatch" };

/** The target of a lifecycle event: a session, and any client id it is about to speak for. */
export type ClientGatewayTraceLifecycleTarget = {
  sessionId: string;
  clientId: string | null;
};
