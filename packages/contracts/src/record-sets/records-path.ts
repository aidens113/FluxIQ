import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS } from "./output.ts";

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,100}$/u;
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Splits a record output's `recordsPath` into its segments, or returns null
 * when the path is invalid.
 *
 * A valid path is 1 to `recordsPathMaxSegments` dot-separated segments of
 * letters, digits, `_`, and `-`, at most `recordsPathMaxLength` characters in
 * all, with no `__proto__`, `constructor`, or `prototype` segment. Readers of
 * `outputs.result` walk exactly these segments.
 */
export function parseAutomationStudioRecordsPath(value: unknown): string[] | null {
  if (typeof value !== "string" || value.length === 0 || value.length > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.recordsPathMaxLength) return null;
  const segments = value.split(".");
  if (segments.length > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.recordsPathMaxSegments) return null;
  for (const segment of segments) {
    if (!SEGMENT_PATTERN.test(segment) || FORBIDDEN_SEGMENTS.has(segment)) return null;
  }
  return segments;
}
