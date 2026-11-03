// Shapes of chunked gateway trace event bodies (trace-offline-trials-plan,
// lane T P3). An event's JSON is either kept inline or cut into content-defined
// chunks, each addressed by the SHA-256 of its raw bytes and stored once per
// project; the event row keeps the ordered digests and the total byte length.
// A chunk's stored bytes are sealed by the project's content protection when
// the store has one (lane T P3-E), as protected content-store objects are, and
// then (t745) its digest is the keyed address of its bytes under the key its
// row names, cut by a keyed gear table; `null` names the old form, SHA-256.
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";

/** One piece of an event body: its digest (32 bytes) in the form `addressKeyId` names, and its bytes. */
export type GatewayTraceChunk = {
  readonly digest: Buffer;
  /** The address key the digest was made under; `null` for the plain SHA-256. */
  readonly addressKeyId: string | null;
  readonly bytes: Uint8Array;
};

/** How a chunk's bytes are kept: as they are, or raw-deflated when that is smaller. */
export type GatewayTraceChunkEncoding = "raw" | "deflate";

/** A chunk as its row holds it. */
export type GatewayTraceStoredChunk = {
  readonly encoding: GatewayTraceChunkEncoding;
  readonly stored: Buffer;
};

/**
 * How a store seals, opens and addresses what it keeps: its project, the host's
 * content protection when one is configured, and with it the project's
 * content-address keyring (t745), which keys new digests and verifies keyed rows.
 */
export type GatewayTraceChunkSealing = {
  readonly projectId: string;
  readonly protection: AutomationStudioProjectContentProtection | undefined;
  readonly keyring: AutomationStudioContentAddressKeyring | undefined;
};

/** An event body ready to write: inline JSON, or the ordered chunks of its UTF-8 bytes. */
export type GatewayTraceEventBody =
  | { readonly kind: "inline"; readonly json: string }
  | {
      readonly kind: "chunked";
      readonly byteLength: number;
      /** The chunks' digests in order, concatenated (32 bytes each). */
      readonly digests: Buffer;
      /** The address key every digest was made under; `null` for the plain SHA-256. */
      readonly addressKeyId: string | null;
      readonly chunks: readonly GatewayTraceChunk[];
    };

/** A chunked event body to read back: where it is (for messages), its digest list, the key it names, and its length. */
export type GatewayTraceChunkedBodyRef = {
  readonly where: string;
  readonly digests: Buffer;
  /** Every chunk it names must be in this same form. */
  readonly addressKeyId: string | null;
  readonly byteLength: number;
};
