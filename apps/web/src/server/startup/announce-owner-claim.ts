import type { Logger } from "../log";

export type OwnerClaimPreparation = { claimed: boolean; codeFile: string | null };

export type AnnounceOwnerClaimOptions = {
  profile: "local" | "self-hosted" | "service";
  publicOrigin: string;
  logger: Logger;
  /** Prepares the one-time setup code when no owner has claimed the instance. */
  prepare(): Promise<OwnerClaimPreparation>;
};

/**
 * Outside the local profile, prepares the owner claim and, when it is still
 * unclaimed, logs where the setup code file is and the setup page. The code
 * itself is never logged.
 */
export async function announceOwnerClaim(options: AnnounceOwnerClaimOptions): Promise<void> {
  if (options.profile === "local") return;
  const claim = await options.prepare();
  if (claim.claimed) return;
  const where = claim.codeFile === null ? "the setup code is not stored in a file" : `read the setup code from ${claim.codeFile}`;
  options.logger.info(`[FluxIQ] This instance has no owner yet: ${where}, then open ${options.publicOrigin}/setup`);
}
