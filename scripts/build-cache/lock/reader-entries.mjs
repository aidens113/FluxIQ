// Where a step lock's readers are recorded: one owner file per reader beside
// the writer's lock, `<lock>.reader-<token>`, so readers never contend with
// each other and a writer finds them all with one directory listing. The
// temporary files `createLockFile` links from end in `.tmp` and are not
// entries.

import { readdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** The entry a reader holding `token` owns. */
export function readerEntryPath(lockPath, token) {
  return `${lockPath}.reader-${token}`;
}

/** Every reader entry of `lockPath` present now, as full paths. */
export async function listReaderEntries(lockPath) {
  const prefix = `${path.basename(lockPath)}.reader-`;
  let names;
  try {
    names = await readdir(path.dirname(lockPath));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => name.startsWith(prefix) && TOKEN.test(name.slice(prefix.length)))
    .map((name) => path.join(path.dirname(lockPath), name));
}
