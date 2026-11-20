const HEX_NAME = /^key ~((?:[0-9a-f]{2})+)$/iu;
const OPAQUE_ID = /^[0-9a-f-]{8,}$/iu;

/** The text a run of hex digits spells, or null when it is not valid UTF-8 text. */
function decodeHex(hex: string): string | null {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.includes("�") ? null : text;
}

/**
 * What an entry acted on, in words. A key is recorded as `key ~<hex>`, the hex
 * being its stored reference: when that decodes to a readable name the name is
 * used, otherwise it reads "a key". No hex or id reaches the person.
 */
export function resourceWords(resource: string): string {
  const hex = HEX_NAME.exec(resource)?.[1];
  if (hex === undefined) return resource;
  const decoded = decodeHex(hex)?.replace(/^secret:/u, "").trim();
  if (!decoded || OPAQUE_ID.test(decoded) || /[^\p{L}\p{N} ._'-]/u.test(decoded)) return "a key";
  return `the key ${decoded}`;
}
