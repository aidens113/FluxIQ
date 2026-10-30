/**
 * Parses a non-negative integer setting. `nullable` settings read "0" or "off"
 * as null. Unset or empty gives the fallback; anything else non-numeric throws
 * (naming the variable, never its value).
 */
export function parseIntegerSetting(name: string, raw: string | undefined, fallback: number | null, nullable: boolean): number | null {
  const text = raw?.trim() ?? "";
  if (text === "") return fallback;
  if (nullable && (text === "0" || text.toLowerCase() === "off")) return null;
  if (!/^\d+$/u.test(text)) throw new Error(`${name} must be a non-negative integer${nullable ? " or off" : ""}.`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || (!nullable && value <= 0)) throw new Error(`${name} must be a positive integer.`);
  return value;
}
