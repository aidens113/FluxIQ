import type { IdentityAccessService } from "fluxiq";
import type { FluxIQDeploymentSettings, PlatformProvisioning } from "fluxiq/platform";

// The owner claim's types (hosted production plan, Identity And Sessions:
// "Owner claim replaces admin/admin"). On `self-hosted` and `service` a
// one-time setup code unlocks `/setup`, which creates the owner through
// `platform.provisioning.createAccount` with `FluxIQOwnerFullAccess`.

/** `<fluxiq>/security/owner-claim.json`: the instance is claimed iff it exists. It holds no secret. */
export type OwnerClaimMarker = {
  schemaVersion: 1;
  /** ISO 8601. */
  claimedAt: string;
  ownerUserId: string;
};

export type PrepareOwnerClaimInput = { settings: FluxIQDeploymentSettings; fluxiqDir: string };

/** `codeFile` is where the setup code is, for the start-up log line; it is null once claimed (and on `local`). */
export type PrepareOwnerClaimResult = { claimed: boolean; codeFile: string | null };

/** What the person typed on `/setup`, after the code was checked. `username` is the owner's email, which is the sign-in name. */
export type OwnerClaimForm = { username: string; displayName: string; password: string };

/** What happened to the default `admin` account: deleted (it still had its default password), disabled (it did not), or there was none. */
export type DefaultAdminOutcome = "deleted" | "disabled" | "absent";

export type OwnerClaimRefusalCode = "already_claimed" | "invalid_input" | "username_taken" | "weak_password" | "claim_incomplete" | "claim_failed";

export type OwnerClaimOutcome =
  | { ok: true; userId: string; defaultAdmin: DefaultAdminOutcome }
  /** `fields` names the form fields at fault for `invalid_input`; never their values. */
  | { ok: false; code: OwnerClaimRefusalCode; fields?: string[] };

/** The identity-access operations the claim uses, so tests can pass the real service of a temporary FluxIQ instance. */
export type OwnerClaimIdentity = Pick<IdentityAccessService, "authenticate" | "deleteUser" | "revokeSession" | "revokeUserSessions" | "snapshot" | "updateUser">;

export type OwnerClaimDeps = {
  settings: FluxIQDeploymentSettings;
  fluxiqDir: string;
  provisioning: Pick<PlatformProvisioning, "run">;
  identityAccess: OwnerClaimIdentity;
  /** One line per claim; never a code, password or token. Defaults to `console.info`. */
  log?: (line: string) => void;
};
