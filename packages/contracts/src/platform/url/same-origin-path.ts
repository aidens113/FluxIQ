const PROBE_ORIGIN = "https://same-origin.invalid";
const UNSAFE_PATTERN = /[\\\s\u0000-\u001f\u007f]/u;

/** The longest same-origin path the platform contracts accept. */
export const SAME_ORIGIN_PATH_MAX_LENGTH = 2048;

/**
 * True for a path that stays on the origin it is resolved against: it starts
 * with exactly one `/` (never `//`, which a browser reads as another host),
 * holds no backslash, whitespace or control character, and resolves to the
 * same origin. Query and fragment are allowed.
 */
export function isSameOriginPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > SAME_ORIGIN_PATH_MAX_LENGTH) return false;
  if (!value.startsWith("/") || value.startsWith("//") || UNSAFE_PATTERN.test(value)) return false;
  return URL.canParse(value, PROBE_ORIGIN) && new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
}
