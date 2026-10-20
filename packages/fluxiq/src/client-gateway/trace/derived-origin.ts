// Derived traces (source test T24). A trace a replay produced, or one that left
// Core and came back, is `derived`, and nothing makes it live again: deriving
// a derived trace keeps it derived and keeps its original source traces.
// Anything ingesting a trace from outside Core derives it first, so editing an
// exported trace to claim `live` cannot create live evidence.

import type { ClientGatewayTraceDerivation, ClientGatewayTraceEvent, ClientGatewayTraceManifest } from "./types.ts";

/** A derived copy of `manifest`. */
export function deriveClientGatewayTraceManifest(manifest: ClientGatewayTraceManifest, derivation: ClientGatewayTraceDerivation): ClientGatewayTraceManifest {
  const sourceTraceIds = manifest.origin.kind === "derived" ? manifest.origin.sourceTraceIds : [manifest.traceId];
  return Object.freeze({ ...manifest, origin: Object.freeze({ kind: "derived", derivation, sourceTraceIds: Object.freeze([...sourceTraceIds]) }) });
}

/** A derived copy of `event`. */
export function deriveClientGatewayTraceEvent(event: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  return Object.freeze({ ...event, provenance: Object.freeze({ episodeId: event.provenance.episodeId, origin: "derived" }) });
}

/** True only for a trace a live episode delivered. */
export function isClientGatewayTraceLive(manifest: ClientGatewayTraceManifest): boolean {
  return manifest.origin.kind === "live";
}
