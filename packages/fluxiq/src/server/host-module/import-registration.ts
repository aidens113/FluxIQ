import { pathToFileURL } from "node:url";
import type { FluxIQ } from "../../framework/index.ts";

/** What a domain host module exports: a synchronous registration that binds its domain to an instance. */
export type FluxIQHostModuleRegistration = (fluxiq: FluxIQ) => FluxIQ | void;

/**
 * Loads a host module with a native dynamic import(). FluxIQ packages are
 * ESM-only and export only the `import` condition, so a host reaches public
 * subpaths such as `fluxiq/automation` only as an ES module; require() cannot
 * resolve them. import() also still loads a CommonJS host that needs no FluxIQ
 * runtime import.
 */
export async function importFluxIQHostModule(modulePath: string): Promise<Record<string, unknown>> {
  try {
    // The host path is known only at runtime, so a bundler must leave this a
    // native import() rather than bundle it; @vite-ignore quiets Vite in tests.
    return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(modulePath).href) as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw new Error(`FLUXIQ_HOST_MODULE could not resolve a package export. FluxIQ packages are ESM-only, so a host that imports them must be an ES module (.mjs, or .js under "type": "module"): ${modulePath}`, { cause: error });
    }
    throw error;
  }
}

/** The registration a loaded host module exports, by name or as its default, or null when it exports none. */
export function fluxIQHostModuleRegistration(namespace: Record<string, unknown>): FluxIQHostModuleRegistration | null {
  // import() of a CommonJS host exposes module.exports as the default export.
  const commonJsExports = typeof namespace.default === "object" && namespace.default !== null
    ? namespace.default as Record<string, unknown>
    : {};
  const register = [namespace.registerFluxIQHost, commonJsExports.registerFluxIQHost, namespace.default, commonJsExports.default]
    .find((candidate) => typeof candidate === "function");
  return (register as FluxIQHostModuleRegistration | undefined) ?? null;
}
