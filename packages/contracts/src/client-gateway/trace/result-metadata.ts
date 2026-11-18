import type { ClientGatewayTraceArtifactReference } from "./artifact/index.ts";

/** On a traced command's result `metadata.trace`: what the client uploaded, and how many artifacts it could not. */
export type ClientGatewayTraceResultMetadata = {
  artifacts: ClientGatewayTraceArtifactReference[];
  unavailable: number;
};
