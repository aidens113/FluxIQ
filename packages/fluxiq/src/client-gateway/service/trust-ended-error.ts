/** Raised when a client's trust ended while a rotation was being written. */
export class ClientGatewayTrustEndedError extends Error {
  constructor() {
    super("The client's trust ended during a reconnect.");
    this.name = "ClientGatewayTrustEndedError";
  }
}
