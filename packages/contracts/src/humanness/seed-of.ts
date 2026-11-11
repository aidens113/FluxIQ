/**
 * A 32-bit seed from text (FNV-1a), for a generator whose seed must follow from
 * something already recorded, such as a command id, rather than be written down
 * separately. The same text always gives the same seed.
 */
export function humannessSeedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
