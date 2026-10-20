// Types of the gateway-internal trace tap (traces and offline trials, P2):
// what it is built from, what an inbound capture hands back for its
// disposition, what a trace artifact intake answers, and the session view a
// trace records when it first claims a session.

import type { ClientGatewayCapability, ClientGatewayClientType, ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../../core/index.ts";
import type { ClientGatewayTraceCaptureSource, ClientGatewayTraceSink } from "../../trace/index.ts";

/** What the tap is built from. `source` unset: the tap does nothing at all. */
export type ClientGatewayTraceTapOptions = {
  source: ClientGatewayTraceCaptureSource | undefined;
  /** The client id a session currently speaks for, or `undefined` for an unknown session. */
  clientIdOf: (sessionId: string) => string | undefined;
  /**
   * The session record, read when a trace first claims the session so the
   * trace keeps its public view (`./session-view.ts`, P3 D23); only named
   * public fields are read from it. Omitted: no view is recorded, as before.
   */
  sessionViewOf?: (sessionId: string) => ClientGatewaySession | undefined;
};

/** A session's public view as a trace records it when it first claims the session (P3 D23); never a token or pairing code. */
export type ClientGatewayTraceSessionView = {
  readonly clientType: ClientGatewayClientType;
  readonly name: string;
  readonly version: string | null;
  readonly capabilities: readonly ClientGatewayCapability[];
  readonly metadata: JsonObject | null;
};

/** One sink an inbound message was recorded into, and the event id it took there. */
export type ClientGatewayTraceInboundTarget = {
  readonly sink: ClientGatewayTraceSink;
  readonly eventId: string;
};

/** Where an inbound message went, so its disposition follows it to the same traces. */
export type ClientGatewayTraceInboundCapture = {
  /** The session the message came from. */
  readonly sessionId: string;
  readonly messageType: string | null;
  readonly commandId: string | null;
  readonly recordingId: string | null;
  readonly targets: readonly ClientGatewayTraceInboundTarget[];
};

/**
 * The digests (`./delivered-digest.ts`) of what Core delivered for an inbound
 * message: the result handed to the waiting caller, the event emitted to
 * listeners. `null`: nothing was.
 */
export type ClientGatewayTraceDelivery = {
  readonly result: string | null;
  readonly event: string | null;
};

/** What Core did with an inbound message, recorded after it was handled. */
export type ClientGatewayTraceDisposition = {
  disposition: string;
  /** The failure's message when handling threw; the socket host answers it with `gateway.receive_failed`. */
  error: string | null;
  /** What Core delivered for it; omitted, nothing was. */
  delivered?: ClientGatewayTraceDelivery;
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
