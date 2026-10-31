import { pathToFileURL } from "node:url";

/** The default importer: the path is known only at runtime, so bundlers must leave this a native import(). */
export async function importHostModule(modulePath: string): Promise<Record<string, unknown>> {
  return (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(modulePath).href)) as Record<string, unknown>;
}
