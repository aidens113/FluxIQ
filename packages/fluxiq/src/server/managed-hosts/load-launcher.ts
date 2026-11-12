import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FluxIQHostLauncher } from "./host-launcher.ts";

/** Loads the explicitly configured launcher; Core depends on no browser implementation. */
export async function loadManagedHostLauncher(specifier: string | undefined, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<FluxIQHostLauncher> {
  const requested = specifier?.trim() || new Map(Object.entries(env)).get("FLUXIQ_BROWSER_HOST")?.trim();
  if (!requested) throw new Error("--browsers requires --browser-host <module> or FLUXIQ_BROWSER_HOST.");
  const file = path.isAbsolute(requested) || requested.startsWith(".")
    ? path.resolve(cwd, requested)
    : createRequire(path.join(cwd, "package.json")).resolve(requested);
  const namespace = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(file).href) as Record<string, unknown>;
  const factory = namespace.createFluxIQHostLauncher ?? namespace.default;
  const launcher: unknown = typeof factory === "function" ? await factory(env) : factory;
  if (launcher === null || typeof launcher !== "object" || typeof (launcher as FluxIQHostLauncher).launch !== "function") throw new Error(`The browser host module must export a launcher or createFluxIQHostLauncher(env): ${requested}`);
  return launcher as FluxIQHostLauncher;
}
