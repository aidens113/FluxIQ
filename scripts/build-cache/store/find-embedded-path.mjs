// The first file that holds one of the given path spellings, or `null`.
//
// Bytes are ASCII-lower-cased before the search and the spellings are lower
// case (`path-spellings.mjs`), so a match is case-insensitive in every segment.
// A path with non-ASCII characters is still matched by its own lower-cased
// UTF-8 bytes wherever the file spells those characters the same way.

import { readFile } from "node:fs/promises";

/**
 * @param {string[]} files absolute paths
 * @param {string[]} spellings lower-cased, as `pathSpellings` returns them
 * @returns {Promise<{ file: string, spelling: string } | null>}
 */
export async function findEmbeddedPath(files, spellings) {
  const needles = spellings.map((spelling) => ({ spelling, bytes: Buffer.from(spelling, "utf8") }));
  for (const file of files) {
    const bytes = lowerAscii(await readFile(file));
    const hit = needles.find((needle) => bytes.includes(needle.bytes));
    if (hit !== undefined) return { file, spelling: hit.spelling };
  }
  return null;
}

function lowerAscii(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte >= 0x41 && byte <= 0x5a) bytes[index] = byte + 0x20;
  }
  return bytes;
}
