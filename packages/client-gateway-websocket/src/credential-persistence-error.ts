/** Local storage failure, safe to forward through the existing transport error event. */
export class FluxIQClientGatewayCredentialPersistenceError extends Error {
  constructor(operation: "read" | "write") {
    super(operation === "read"
      ? "FluxIQ could not read the connection credential. Reconnect when storage is available."
      : "FluxIQ could not save the connection credential. Reconnect when storage is available.");
    this.name = "FluxIQClientGatewayCredentialPersistenceError";
  }
}
