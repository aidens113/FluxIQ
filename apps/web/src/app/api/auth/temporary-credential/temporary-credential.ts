/**
 * The account identity access creates on an empty store, and its temporary
 * password. Everyone knows it, so it must never open a panel session.
 */
export const TEMPORARY_CREDENTIAL = { userId: "admin", username: "admin", password: "admin" } as const;
