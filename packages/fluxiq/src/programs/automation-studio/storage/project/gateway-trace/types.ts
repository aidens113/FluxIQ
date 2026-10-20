// Shapes of chunked gateway trace event bodies (trace-offline-trials-plan,
// lane T P3). An event's JSON is either kept inline or cut into content-defined
// chunks, each addressed by the SHA-256 of its raw bytes and stored once per
// project; the event row keeps the ordered digests and the total byte length.
// A chunk's stored bytes are sealed by the project's content protection when
// the store has one (lane T P3-E), as protected content-store objects are.
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";

/** One piece of an event body: the SHA-256 of its raw bytes (32 bytes) and those bytes. */
export type GatewayTraceChunk = {
  readonly digest: Buffer;
  readonly bytes: Uint8Array;
};

/** How a chunk's bytes are kept: as they are, or raw-deflated when that is smaller. */
export type GatewayTraceChunkEncoding = "raw" | "deflate";

/** A chunk as its row holds it. */
export type GatewayTraceStoredChunk = {
  readonly encoding: GatewayTraceChunkEncoding;
  readonly stored: Buffer;
};

/** How a store seals and opens chunks: its project, and the host's content protection when one is configured. */
export type GatewayTraceChunkSealing = {
  readonly projectId: string;
  readonly protection: AutomationStudioProjectContentProtection | undefined;
};

/** An event body ready to write: inline JSON, or the ordered chunks of its UTF-8 bytes. */
export type GatewayTraceEventBody =
  | { readonly kind: "inline"; readonly json: string }
  | {
      readonly kind: "chunked";
      readonly byteLength: number;
      /** The chunks' digests in order, concatenated (32 bytes each). */
      readonly digests: Buffer;
      readonly chunks: readonly GatewayTraceChunk[];
    };

/** A chunked event body to read back: where it is (for messages), its digest list and its length. */
export type GatewayTraceChunkedBodyRef = {
  readonly where: string;
  readonly digests: Buffer;
  readonly byteLength: number;
};
