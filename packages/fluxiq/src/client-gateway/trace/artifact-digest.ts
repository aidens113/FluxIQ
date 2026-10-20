// The integrity digest of captured artifact bytes. Kept in its own file because
// it reaches Node: the trace module is exported from `client-gateway/index.ts`
// only, never from the browser-bundle entry `client-gateway/contracts.ts`.

import { createHash } from "node:crypto";

/** Lower-case hex SHA-256 of `bytes`. */
export function clientGatewayTraceArtifactDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
