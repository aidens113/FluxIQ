// Barrel for what an identity store starts with: the default admin on its
// temporary password (the library's default, which tests and embedders use),
// or no account at all until a first-run setup creates the owner (the web
// panel on the local profile), and how to tell which of those a store is in.
export * from "./identity-first-run-control.ts";
export * from "./invalid-credentials.ts";
export * from "./read-first-run-state.ts";
export * from "./seed-temporary-admin.ts";
export * from "./temporary-admin.ts";
