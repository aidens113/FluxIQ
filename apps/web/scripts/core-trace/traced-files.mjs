// Every file the Node server's traces name: the list a standalone output
// (`output: "standalone"`) copies. Each `.nft.json` beside a server entry
// lists files relative to itself. Edge traces are left out.
//
// Loaded by `next.config.ts`, which Next compiles to CommonJS: no top-level
// await, no `import.meta`.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * @param {string} serverDirectory a build's `.next/server`
 * @returns {Promise<{ traces: number, files: Set<string> }>} how many traces were read, and the absolute paths they name (normalised to lower case on Windows)
 */
export async function tracedFiles(serverDirectory) {
  const files = new Set();
  let traces = 0;
  for (const trace of await traceFiles(serverDirectory, serverDirectory)) {
    traces += 1;
    const listed = JSON.parse(await readFile(trace, "utf8")).files;
    if (!Array.isArray(listed)) continue;
    for (const file of listed) if (typeof file === "string") files.add(normalise(path.resolve(path.dirname(trace), file)));
  }
  return { traces, files };
}

/** How a path is compared with traced ones. */
export function normalise(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function traceFiles(directory, root) {
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
      if (entry.isDirectory()) return path.relative(root, target) === "edge" ? [] : traceFiles(target, root);
      return entry.isFile() && entry.name.endsWith(".nft.json") ? [target] : [];
    })
  );
  return nested.flat();
}
