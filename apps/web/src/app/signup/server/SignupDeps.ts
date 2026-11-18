import type { PlatformProvisioning } from "fluxiq/platform";

/** What the sign-up submit needs: the provisioning service, called in-process (never over the private listener). */
export type SignupDeps = {
  provisioning: PlatformProvisioning;
  /** Told the code of a refusal the form cannot explain (a misconfiguration); never the email or name. */
  log?: (line: string) => void;
};
