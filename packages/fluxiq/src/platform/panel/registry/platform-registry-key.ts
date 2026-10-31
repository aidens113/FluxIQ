/** Held on globalThis because Next bundles server entry points separately, so a module-level variable would not be shared. */
export const PLATFORM_REGISTRY_KEY = Symbol.for("fluxiq.platformRegistry");
