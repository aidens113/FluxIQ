// Whether one directory lies inside another, by the same identity rule as
// `path-identity.mjs`: `child` is inside `parent` when `child` or one of its
// ancestors names the same directory as `parent`. Walking up and comparing with
// `samePath`, rather than comparing string prefixes, is what keeps a sibling
// that merely shares a prefix (`!FluxIQ-old` beside `!FluxIQ`) outside, and
// lets case and slash direction differ on Windows. The downstream
// web-extension repository imports this module to refuse deleting or creating a
// worktree inside a checkout somebody works in.

import path from "node:path";
import { samePath } from "./path-identity.mjs";

/** Whether `child` is `parent` or lies below it. */
export function pathInside(parent, child) {
  let current = path.resolve(child);
  for (;;) {
    if (samePath(current, parent)) return true;
    const up = path.dirname(current);
    if (up === current) return false;
    current = up;
  }
}
