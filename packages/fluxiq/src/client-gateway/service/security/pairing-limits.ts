/**
 * Caps on pairing challenges still waiting for approval. `total` bounds them
 * across the gateway; `perAddress` bounds those asked for from one client
 * address, and `null` turns that cap off. A challenge whose session has no
 * known address counts towards `total` only.
 */
export type ClientGatewayPairingLimits = {
  perAddress: number | null;
  total: number;
};

/** The defaults: a local single-user install never meets either. */
export const CLIENT_GATEWAY_DEFAULT_PAIRING_LIMITS: Readonly<ClientGatewayPairingLimits> = Object.freeze({ perAddress: null, total: 1000 });

/** Validated limits, defaults filled in; throws on a value that is not a positive whole number. */
export function resolveClientGatewayPairingLimits(input: Partial<ClientGatewayPairingLimits> | undefined): ClientGatewayPairingLimits {
  const total = input?.total ?? CLIENT_GATEWAY_DEFAULT_PAIRING_LIMITS.total;
  const perAddress = input?.perAddress === undefined ? CLIENT_GATEWAY_DEFAULT_PAIRING_LIMITS.perAddress : input.perAddress;
  if (!isPositiveWholeNumber(total)) throw new Error("client_gateway.pairing_limits_invalid: total must be a positive whole number.");
  if (perAddress !== null && !isPositiveWholeNumber(perAddress)) {
    throw new Error("client_gateway.pairing_limits_invalid: perAddress must be a positive whole number or null.");
  }
  return { perAddress, total };
}

function isPositiveWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
