/**
 * `server.pairing_required`. Gateway 0.2 adds `codeEntryUrl`, the same-origin
 * path where the signed-in person types `referenceCode` (Flow B).
 */
export type ClientGatewayPairingRequired = { referenceCode?: string; reason: string; codeEntryUrl?: string };
