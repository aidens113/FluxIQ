import type { ClientGatewayPairingCredentialRefusal } from "./credential-refusal.ts";

/**
 * `server.pairing_required`. Gateway 0.2 adds `codeEntryUrl`, the same-origin
 * path where the signed-in person types `referenceCode` (Flow B), and
 * `credential`, why the credential the hello carried was not accepted.
 */
export type ClientGatewayPairingRequired = { referenceCode?: string; reason: string; codeEntryUrl?: string; credential?: ClientGatewayPairingCredentialRefusal };
