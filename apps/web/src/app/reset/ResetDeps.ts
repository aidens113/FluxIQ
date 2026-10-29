import type { PlatformAccountLinks } from "fluxiq/platform";

/** What the reset routes need: the reset half of the account links. */
export type ResetDeps = {
  links: Pick<PlatformAccountLinks, "requestReset" | "redeemReset">;
};
