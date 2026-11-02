/**
 * A short, stable digest of what a step returned.
 *
 * FNV-1a over the canonical text, with the byte length carried alongside. Not a
 * cryptographic hash and not trying to be: nothing here is a security boundary,
 * the question is only "have I seen this answer before", and the alternative --
 * keeping every evidence payload an exploration ever collected so they can be
 * compared whole -- is a quarter of a megabyte per step held for the sake of an
 * equality check.
 */
export function automationStudioExplorationEvidenceDigest(canonicalText: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonicalText.length; index += 1) {
    hash ^= canonicalText.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${canonicalText.length}:${hash.toString(16)}`;
}
