import { pathToFileURL } from "node:url";

/**
 * The path is known only at runtime, so bundlers must leave this a native import().
 * The SDK's final tsconfig.runtime-imports.json pass preserves these directives:
 * extension rewriting would nest them inside a helper, where Turbopack cannot see them.
 */
export async function importHostModule(modulePath: string): Promise<Record<string, unknown>> {
  return (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(modulePath).href)) as Record<string, unknown>;
}
