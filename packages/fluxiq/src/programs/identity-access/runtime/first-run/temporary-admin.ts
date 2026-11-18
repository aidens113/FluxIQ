/**
 * The account an empty store starts with unless it starts unclaimed, and its
 * temporary password. Everyone knows the password, so a host that serves
 * people starts unclaimed instead (`IdentityAccessService.firstRun.startUnclaimed`).
 */
export const TEMPORARY_ADMIN = { userId: "admin", username: "admin", displayName: "Administrator", password: "admin" } as const;
