import { claimFluxIQDataRoot, FluxIQDataRootHeldError, type ClaimFluxIQDataRootOptions, type FluxIQDataRootClaim } from "../../../server/data-root-owner/index.ts";
import { AccountsTransportError } from "./transport-error.ts";

/**
 * Offline `fluxiq accounts` writes the platform store, IAM and identity directly, so it holds the
 * data root for the length of the command, as a server does. While a server holds it the
 * command is refused with how to reach that server instead: an offline write would leave the
 * server acting on what it last read, a disabled person's paired client included.
 */
export async function claimOfflineAccountsDataRoot(rootDir: string, options: Omit<ClaimFluxIQDataRootOptions, "role"> = {}): Promise<FluxIQDataRootClaim> {
  try {
    return await claimFluxIQDataRoot(rootDir, { ...options, role: "offline fluxiq accounts" });
  } catch (error) {
    if (!(error instanceof FluxIQDataRootHeldError)) throw error;
    throw new AccountsTransportError(refusal(error));
  }
}

function refusal(error: FluxIQDataRootHeldError): string {
  const lines = [
    `Offline mode refused: the FluxIQ data at ${error.rootDir} is being served by ${error.holderSummary()}.`,
    "An offline change would not reach that server, which keeps acting on the accounts and permissions it last read.",
    "Run the command against the live server instead: leave out --offline and set FLUXIQ_PROVISIONING_LISTEN (host:port) and FLUXIQ_PROVISIONING_TOKEN_FILE to that server's private provisioning listener.",
    "If the server has no provisioning listener (`fluxiq dev` has none), stop it and run the command again."
  ];
  if (error.holder.kind !== "live") lines.push(`If no FluxIQ server is running there, delete ${error.ownerFile} and run the command again.`);
  return lines.join("\n");
}
