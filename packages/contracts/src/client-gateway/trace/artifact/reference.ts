import type { ClientGatewayTraceArtifactRole } from "./role.ts";

/** One artifact a client uploaded for a traced command; `sha256` is the lower-case hex SHA-256 of its bytes. */
export type ClientGatewayTraceArtifactReference = {
  sha256: string;
  mediaType: string;
  byteLength: number;
  role: ClientGatewayTraceArtifactRole;
  /** Where the client found it, opaque to Core (the primary artifact refers to it by this). */
  source?: string;
};
