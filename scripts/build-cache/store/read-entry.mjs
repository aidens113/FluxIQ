// A stored entry's description (`entry.json`), or `null` when the key holds
// none. An unparsable description is a half-written or foreign entry and
// reads as none; the writer replaces it and a reader builds.

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * @param {string} dir the entry's directory
 * @returns {Promise<null | { format: number, step: string, kind: string, fingerprint: string, outputDigest: string, root: string | null, output: string | null, bytes: number, files: { output: string, relative: string, size: number }[] }>}
 */
export async function readEntry(dir) {
  try {
    return JSON.parse(await readFile(path.join(dir, "entry.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}
