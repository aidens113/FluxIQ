/** Which pending-pairing cap a new challenge met. */
export type ClientGatewayPairingCapacityScope = "total" | "per_address";

/**
 * A new pairing challenge refused because a pending-pairing cap was reached
 * (`ClientGatewayPairingLimits`). `code` is what a caller reads; the client
 * that asked is told the same code in `server.error`.
 */
export class ClientGatewayPairingCapacityError extends Error {
  readonly code = "pairing.capacity_reached";
  readonly scope: ClientGatewayPairingCapacityScope;

  constructor(scope: ClientGatewayPairingCapacityScope) {
    super(scope === "per_address"
      ? "Too many pairing requests are waiting from this network. Approve or dismiss one in FluxIQ, or wait for one to expire, then reconnect."
      : "Too many pairing requests are waiting in FluxIQ. Approve or dismiss one, or wait for one to expire, then reconnect.");
    this.name = "ClientGatewayPairingCapacityError";
    this.scope = scope;
  }
}
