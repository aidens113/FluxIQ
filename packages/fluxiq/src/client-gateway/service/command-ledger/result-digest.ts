import { clientGatewayCanonicalDigest } from "./canonical-digest.ts";
import { ClientGatewayCommandLedgerController } from "./controller.ts";

/**
 * Full admitted result integrity. The transport owns deployment payload limits;
 * opaque evidence is not constrained by the small claim/receipt byte or node caps.
 * Depth, plain JSON and descriptor/cycle safety remain identical to ledger hashing.
 */
export function clientGatewayCommandResultDigest(value: unknown): string {
  return clientGatewayCanonicalDigest(value, { maxDepth: ClientGatewayCommandLedgerController.HASH_MAX_DEPTH });
}
