// Where Core files a Flow it creates (plan, O2): the runtime, then the site or app,
// then the task, as `web/market.example/cheapest-listings` or
// `android/messages/send-reply`. Deterministic, so the same task lands in the same
// folder from any client. A person's own move or rename always wins over this
// placement; the rule only decides where a new Flow starts.

import type { FluxNodeParseResult } from "../issue/index.ts";
import { FLOW_PATH_LIMITS, joinFlowPath } from "./path.ts";

/**
 * Turns free text into one path segment: lowercased, accents dropped, every run of
 * other characters a "-", trimmed of "-", "." and "_" at both ends, at most 64
 * characters. `"Market.Example:8080"` becomes `market.example-8080`, `"Send a
 * reply!"` becomes `send-a-reply`. Null when nothing usable is left.
 */
export function flowPathSegmentFromText(text: string): string | null {
  const folded = text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
  const slug = folded.replace(/[^a-z0-9._-]+/gu, "-").replace(/\.{2,}/gu, ".").replace(/-{2,}/gu, "-");
  const trimmed = trimEnds(slug).slice(0, FLOW_PATH_LIMITS.maxSegmentLength);
  const result = trimEnds(trimmed);
  return result.length > 0 ? result : null;
}

/** Where a new Flow goes: `<runtime>/<site or app>/<task>`, each part slugged. */
export function automaticFlowPath(place: { runtime: string; where: string; task: string }): FluxNodeParseResult<string> {
  const parts = [place.runtime, place.where, place.task].map((part) => flowPathSegmentFromText(part));
  const missing = parts.findIndex((part) => part === null);
  if (missing >= 0) {
    const field = ["runtime", "where", "task"][missing] as string;
    return { ok: false, issues: [{ path: `/${field}`, code: "flow_path.empty_segment", message: `The ${field} has no letters or digits to name a folder by.` }] };
  }
  return joinFlowPath(parts as string[]);
}

function trimEnds(text: string): string {
  return text.replace(/^[-._]+/u, "").replace(/[-._]+$/u, "");
}
