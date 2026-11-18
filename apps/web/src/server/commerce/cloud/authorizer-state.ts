import type { CloudAuthorizer } from "./authorizer-type";

const state = globalThis as typeof globalThis & { __fluxiqCloudAuthorizer?: { current: CloudAuthorizer | null } };

/** Shared across separately bundled Next routes. */
export const cloudAuthorizerState = state.__fluxiqCloudAuthorizer ??= { current: null };
