/** The grant is spent. Delivery/issuance may have completed; restarting consent is the only safe recovery. */
export class ConnectCredentialDeliveryError extends Error {
  readonly code = "connect.credential_delivery_unknown";

  constructor() {
    super("Browser credential delivery could not be confirmed. Restart consent to connect this browser.");
    this.name = "ConnectCredentialDeliveryError";
  }
}
