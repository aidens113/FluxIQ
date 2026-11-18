// The Core entry points the panel's Node server imports through Node.
//
// Turbopack emits an external ES import as `e.y("fluxiq/server")` (a
// CommonJS one as `e.x(...)`) under the request as written, and the client
// gateway's native server (`.server-runtime/client-gateway-server.mjs`,
// bundled by esbuild with `fluxiq/*` external) imports `from "fluxiq/..."`.
// Edge output is left out: middleware bundles what it uses.
//
// Loaded by `next.config.ts`, which Next compiles to CommonJS: no top-level
// await, no `import.meta`.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CHUNK_REQUEST = /\.[xy]\("(fluxiq(?:\/[^"]*)?)"/gu;
const MODULE_REQUEST = /(?:from\s*|import\(\s*)"(fluxiq(?:\/[^"]*)?)"/gu;
const MANIFEST = /manifest\.js$/u;

/**
 * @param {string} serverDirectory a build's `.next/server`
 * @param {string[]} [modules] other server modules Node loads beside the build (the gateway's native server)
 * @returns {Promise<Map<string, string[]>>} each `fluxiq` request, and the files that import it (relative to `serverDirectory`, or the module's own path)
 */
export async function coreRequests(serverDirectory, modules = []) {
  /** @type {Map<string, string[]>} */
  const requests = new Map();
  const note = (request, file) => {
    const files = requests.get(request) ?? [];
    if (!files.includes(file)) files.push(file);
    requests.set(request, files);
  };
  for (const file of await serverJavaScript(serverDirectory, serverDirectory)) {
    if (MANIFEST.test(file)) continue;
    const code = await readFile(path.join(serverDirectory, file), "utf8");
    for (const match of code.matchAll(CHUNK_REQUEST)) note(match[1], file);
  }
  for (const module of modules) {
    let code;
    try {
      code = await readFile(module, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const match of code.matchAll(MODULE_REQUEST)) note(match[1], module);
  }
  return requests;
}

async function serverJavaScript(directory, root) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      const shown = path.relative(root, target).split(path.sep).join("/");
      if (entry.isDirectory()) return shown === "edge" ? [] : serverJavaScript(target, root);
      return entry.isFile() && entry.name.endsWith(".js") ? [shown] : [];
    })
  );
  return nested.flat().sort();
}
