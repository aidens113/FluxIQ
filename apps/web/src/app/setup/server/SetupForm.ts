/** What the setup page posts. `username` is the owner's email, which is the sign-in name. */
export type SetupForm = { code: string; username: string; displayName: string; password: string; confirmation: string };
