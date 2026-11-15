/** No provider messages, schema issues, credentials or identity values escape through this error. */
export class ClientGatewaySessionMetadataUnavailableError extends Error {
  readonly code = "client_gateway.session_metadata_unavailable";

  constructor() {
    super("Client account and workspace details are temporarily unavailable. Reconnect to try again.");
    this.name = "ClientGatewaySessionMetadataUnavailableError";
  }
}
