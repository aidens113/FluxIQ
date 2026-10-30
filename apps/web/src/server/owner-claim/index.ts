// Barrel for the owner claim (hosted production plan, Identity And Sessions:
// "Owner claim replaces admin/admin"): the start-up preparation of the setup
// code, its check, the claimed marker, and the claim itself. `/setup` and its
// submit route (`app/setup/`) are the only callers besides `lib/fluxiq.ts`.
export { claimOwner } from "./claim-owner";
export { isOwnerClaimOpen } from "./is-owner-claim-open";
export { ownerClaimPaths } from "./owner-claim-paths";
export { prepareOwnerClaim } from "./prepare-owner-claim";
export { readConfiguredSetupCode, readGeneratedSetupCode, readOwnerClaimMarker, readSetupCode } from "./read";
export { setupCodeMatches } from "./setup-code-matches";
export { SETUP_CODE_MINIMUM_LENGTH } from "./setup-code-minimum-length";
export type * from "./types";
