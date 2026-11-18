import type { LocalClaimIdentity } from "../../../server/owner-claim";
import type { SetupAttempts } from "./SetupDeps";

/** What the local setup submit needs, injected so tests pass the real identity service of a temporary FluxIQ instance. */
export type LocalSetupDeps = {
  identity: LocalClaimIdentity;
  /** Unlocks the owner's saved keys for the new session, as the sign-in route does; a failure there does not undo the claim. */
  restoreKeys(input: { sessionId: string; userId: string; authorizationPassword: string; expiresAtMs: number }): Promise<unknown>;
  /** Wrong codes for the whole instance. */
  attempts: Pick<SetupAttempts, "global">;
  log?: (line: string) => void;
  nowMs?: () => number;
};
