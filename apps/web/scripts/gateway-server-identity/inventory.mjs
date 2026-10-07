import { readdir } from "node:fs/promises";
import path from "node:path";
/** Complete owned server/registration/generator/cache inputs; generated data and tests excluded. */
export async function serverSourceInventory(root) {
  async function files(directory, suffix) {
    const entries = await readdir(path.join(root, directory), { withFileTypes: true });
    return (await Promise.all(entries.filter(entry => entry.name !== "tests").map(entry => entry.isDirectory()
      ? files(`${directory}/${entry.name}`, suffix) : entry.name.endsWith(suffix) ? [`${directory}/${entry.name}`] : []))).flat();
  }
  return [...await files("apps/web/src/server", ".ts"), ...await files("apps/web/scripts", ".mjs"), ...await files("scripts/build-cache", ".mjs"),
    "apps/web/src/lib/fluxiq.ts", "apps/web/src/instrumentation.ts", "apps/web/package.json", "package.json", "pnpm-lock.yaml"].sort();
}
