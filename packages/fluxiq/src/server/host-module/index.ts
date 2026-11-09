// Barrel for loading a domain host module (`FLUXIQ_HOST_MODULE`) as the web
// panel's `lib/fluxiq.ts` loads it: its path, the native import and its
// registration, and the one host domain an instance picks when none is named.
// Used by the `fluxiq` command (`../cli/`); not part of `fluxiq/server`.
export * from "./host-domain.ts";
export * from "./import-registration.ts";
export * from "./load-registration.ts";
export * from "./resolve-path.ts";
