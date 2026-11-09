// A Flow's path in its project's folder tree (plan, O1-O2): folders, then the Flow's
// own segment, joined by "/", such as `web/market.example/cheapest-listings`. Every
// Flow lives at one; there is no second kind of Flow.
//
// A path segment is a slug: lowercase letters, digits, ".", "_" and "-", starting and
// ending with a letter or digit, with no "..". A Flow's name for a person is separate
// free text; the path is what files, folders and pins are keyed by. Calls name a Flow
// by its id, never its path, so moving or renaming one never breaks a call.

import { finishRawParse, zodFromParser, type FluxNodeParseResult, type FluxNodeRawIssue } from "../issue/index.ts";

/** At most 8 segments, each at most 64 characters, and 256 characters in all. */
export const FLOW_PATH_LIMITS = Object.freeze({ maxSegments: 8, maxSegmentLength: 64, maxLength: 256 });

const SEGMENT = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

/** True when `value` is one valid path segment (see the file header). */
export function isFlowPathSegment(value: unknown): value is string {
  return typeof value === "string" && value.length <= FLOW_PATH_LIMITS.maxSegmentLength && SEGMENT.test(value) && !value.includes("..");
}

/** Reads a Flow path into its raw issue list; codes are prefixed `flow_path.`. */
export function readFlowPath(value: unknown, issues: FluxNodeRawIssue[]): string | null {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path: [], code: "flow_path.not_text", message: "A Flow path is text, such as \"web/market.example/cheapest-listings\"." });
    return null;
  }
  if (value.length > FLOW_PATH_LIMITS.maxLength) {
    issues.push({ path: [], code: "flow_path.too_long", message: `A Flow path is at most ${FLOW_PATH_LIMITS.maxLength} characters.` });
    return null;
  }
  const segments = value.split("/");
  if (segments.length > FLOW_PATH_LIMITS.maxSegments) {
    issues.push({ path: [], code: "flow_path.too_deep", message: `A Flow path has at most ${FLOW_PATH_LIMITS.maxSegments} segments.` });
    return null;
  }
  const bad = segments.findIndex((segment) => !isFlowPathSegment(segment));
  if (bad >= 0) {
    issues.push({
      path: [],
      code: "flow_path.bad_segment",
      message: `Segment ${bad + 1} (${JSON.stringify(segments[bad])}) must be 1 to ${FLOW_PATH_LIMITS.maxSegmentLength} of lowercase a-z, 0-9, ".", "_" and "-", starting and ending with a letter or digit, with no "..".`
    });
    return null;
  }
  return value;
}

/** Parses a Flow path, or says why it is not one. */
export function parseFlowPath(value: unknown): FluxNodeParseResult<string> {
  const issues: FluxNodeRawIssue[] = [];
  return finishRawParse(readFlowPath(value, issues), issues);
}

/** A Flow path as a zod schema. */
export const flowPathSchema = zodFromParser(readFlowPath);

/** Joins segments into a Flow path and checks the result. */
export function joinFlowPath(segments: readonly string[]): FluxNodeParseResult<string> {
  return parseFlowPath(segments.join("/"));
}

/** The folder a Flow path sits in (`web/market.example`), or `""` for a Flow at the project's root. */
export function flowPathFolder(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}
