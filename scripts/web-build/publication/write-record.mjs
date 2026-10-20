// Writes a record to a private temporary file, syncs it and renames it into
// place, so a reader sees no record or a whole one.

import { randomBytes } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";

/** @param {string} target @param {Record<string, unknown>} record */
export async function writeRecord(target, record) {
  const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(/* best-effort: the write error below is what the caller needs */ () => undefined);
    throw error;
  }
}
