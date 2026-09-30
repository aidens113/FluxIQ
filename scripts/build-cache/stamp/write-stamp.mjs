// Writes a step's stamp atomically: to a unique temporary file, then renamed
// over the stamp, so a reader never sees half a stamp and two writers never
// interleave.

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * @param {string} stampPath
 * @param {{ version: number, step: string, fingerprint: string, outputDigest: string, roots: Record<string, string>, output?: string | null }} stamp `output` is what a replaying step printed
 */
export async function writeStamp(stampPath, stamp) {
  await mkdir(path.dirname(stampPath), { recursive: true });
  const temporary = `${stampPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(stamp, null, 2)}\n`);
  try {
    await rename(temporary, stampPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
