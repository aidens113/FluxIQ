// One sha256 over a listed set of files: each file's label and content hash,
// in the listed order, so a rename, an edit, an addition or a removal all
// change it. An absent entry (`path: null`, or a file git still lists that is
// gone from the disk) contributes its label and a marker. Files are hashed a
// bounded number at a time, so a `dist/` of thousands of files does not
// exhaust file handles.
//
// The newest modification time among the files is returned beside the digest:
// `touch-stale-outputs.mjs` compares the newest input with the newest output
// to decide whether a reuse must move an output's timestamp.

import { createHash } from "node:crypto";

const CONCURRENCY = 64;

/**
 * @param {{ label: string, path: string | null }[]} files as `listRootFiles` returns them
 * @param {{ hash(file: string): Promise<string>, mtimeMs(file: string): number | undefined }} statCache
 * @returns {Promise<{ digest: string, newestMs: number, newestPath: string | null }>}
 */
export async function digestFiles(files, statCache) {
  const hashes = new Array(files.length);
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const index = next;
      next += 1;
      hashes[index] = await hashOrAbsent(files[index].path, statCache);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  const digest = createHash("sha256");
  let newestMs = 0;
  let newestPath = null;
  for (let index = 0; index < files.length; index += 1) {
    digest.update(`${files[index].label}\0${hashes[index]}\n`);
    if (hashes[index] === "absent") continue;
    const mtime = statCache.mtimeMs(files[index].path);
    if (mtime !== undefined && mtime > newestMs) {
      newestMs = mtime;
      newestPath = files[index].path;
    }
  }
  return { digest: digest.digest("hex"), newestMs, newestPath };
}

async function hashOrAbsent(file, statCache) {
  if (file === null) return "absent";
  try {
    return await statCache.hash(file);
  } catch (error) {
    // git lists a tracked file that was deleted from the working tree; its
    // absence is an input like any other.
    if (error?.code === "ENOENT") return "absent";
    throw error;
  }
}
