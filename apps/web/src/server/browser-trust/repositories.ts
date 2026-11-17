import type { ClientTrustRepository } from "fluxiq/platform";

const state = globalThis as typeof globalThis & { __fluxiqBrowserTrustRepositories?: Map<string, ClientTrustRepository> };

/** One authority per platform root, shared by separately bundled Next routes. */
export const browserTrustRepositories = state.__fluxiqBrowserTrustRepositories ??= new Map<string, ClientTrustRepository>();
