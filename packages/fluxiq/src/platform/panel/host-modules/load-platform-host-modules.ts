import { existsSync } from "node:fs";
import { getPlatformRegistry } from "../registry/index.ts";
import type { FluxIQPlatform } from "../types.ts";
import { importHostModule } from "./import-host-module.ts";
import { loadedHostModulesStore } from "./loaded-host-modules-store.ts";
import { parseHostModulePaths } from "./parse-host-module-paths.ts";
import type { HostInstanceRegistration, LoadedPlatformHostModules } from "./types.ts";

function pick<T>(namespace: Record<string, unknown>, name: string, allowDefault: boolean): T | null {
  // import() of a CommonJS module exposes module.exports as the default export.
  const commonJs = typeof namespace.default === "object" && namespace.default !== null ? (namespace.default as Record<string, unknown>) : {};
  const candidates = [namespace[name], commonJs[name], ...(allowDefault ? [namespace.default, commonJs.default] : [])];
  return (candidates.find((candidate) => typeof candidate === "function") as T | undefined) ?? null;
}

/**
 * Imports each module of a comma list in order, hands the platform to its
 * `registerFluxIQPlatform` and collects its `registerFluxIQHost`. Idempotent
 * for the same list in one process, including concurrent calls; a different
 * list throws. A failed load stays failed to avoid repeating partial registrations.
 */
export async function loadPlatformHostModules(input: { value: string | undefined; importModule?: (modulePath: string) => Promise<Record<string, unknown>> }): Promise<LoadedPlatformHostModules> {
  const paths = parseHostModulePaths(input.value);
  const key = paths.join("\n");
  const existing = loadedHostModulesStore.read();
  if (existing) {
    if (existing.key !== key) throw new Error("Host modules were already loaded in this process with a different list.");
    return existing.result;
  }
  for (const modulePath of paths) {
    if (!existsSync(modulePath)) throw new Error(`Host module points to a missing file: ${modulePath}`);
  }
  const importModule = input.importModule ?? importHostModule;
  const result = loadModules(paths, importModule);
  // Publish the promise before an import resumes, so startup and route callers
  // share both the registration work and its eventual failure or result.
  loadedHostModulesStore.write({ key, result });
  return result;
}

async function loadModules(paths: string[], importModule: (modulePath: string) => Promise<Record<string, unknown>>): Promise<LoadedPlatformHostModules> {
  const platform = getPlatformRegistry().platform;
  const instanceRegistrations: HostInstanceRegistration[] = [];
  for (const modulePath of paths) {
    let namespace: Record<string, unknown>;
    try {
      namespace = await importModule(modulePath);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
        throw new Error(`Host module could not resolve a package export. FluxIQ packages are ESM-only, so a host that imports them must be an ES module (.mjs, or .js under "type": "module"): ${modulePath}`, { cause: error });
      }
      throw error;
    }
    pick<(platform: FluxIQPlatform) => void>(namespace, "registerFluxIQPlatform", false)?.(platform);
    const instance = pick<HostInstanceRegistration>(namespace, "registerFluxIQHost", true);
    if (instance) instanceRegistrations.push(instance);
  }
  return { paths, instanceRegistrations };
}
