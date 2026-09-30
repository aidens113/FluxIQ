// A step's stamp, or `null` when there is none. A stamp that cannot be parsed
// is reported as `{ unreadable: true }` rather than as absent, so the rebuild
// it causes says why.

import { readFile } from "node:fs/promises";

/**
 * @param {string} stampPath
 * @returns {Promise<null | { unreadable: true } | { version: number, step: string, fingerprint: string, outputDigest: string, roots?: Record<string, string>, output?: string | null }>}
 */
export async function readStamp(stampPath) {
  let text;
  try {
    text = await readFile(stampPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return { unreadable: true };
    throw error;
  }
}
