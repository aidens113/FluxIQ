import type { ClientGatewaySessionReady } from "@fluxiq/contracts/client-gateway";

/** Actual server-ready metadata for the same durable write as its credential. */
export type ClientGatewayCredentialWriteMetadata = Readonly<Omit<ClientGatewaySessionReady, "token"> & { messageId: string }>;
