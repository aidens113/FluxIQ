import type { IdentityAccessService } from "fluxiq";

/** The identity operations the local claim uses, so tests pass the real service of a temporary FluxIQ instance. */
export type LocalClaimIdentity = Pick<IdentityAccessService, "firstRun" | "snapshot" | "upsertUser" | "updateUser" | "authenticate" | "setPasswordAuthorized" | "revokeSession" | "revokeUserSessions">;

/** What the setup page posts on `local`, after the code was checked: the owner's sign-in name and password. */
export type LocalOwnerForm = { username: string; password: string };

export type LocalClaimOutcome =
  | { ok: true; userId: string }
  | { ok: false; code: "already_claimed" | "username_taken" | "claim_failed" };

/** How a typed setup code compares with the one this start issued. */
export type LocalSetupCodeCheck = "valid" | "wrong" | "expired" | "none";

/** What a start found and did: the first-run state, the setup link printed (null once claimed), and the sessions ended by the sweep. */
export type LocalFirstRun = { state: "unclaimed" | "temporary-admin" | "claimed"; link: string | null; revokedSessions: number };
