// What a reuse does to output timestamps: nothing, unless an input file is
// newer than every output file.
//
// Downstream Lab guards read Core's `dist` by modification time. One compares
// the newest source file with the newest output file and calls Core stale
// when the source is newer; another watches the outputs and calls any newer
// output file "Core rebuilt during a run". A reuse must satisfy both:
//   - touching outputs whose inputs are all older would look like a rebuild
//     in the middle of a run, so an ordinary reuse moves nothing;
//   - an input newer than every output -- a file edited and reverted, a
//     checkout that rewrote sources with identical bytes -- would look like a
//     stale build, so then the step's required files move to now. A reuse is
//     exactly as current as a rebuild, and the newest output file is now newer
//     than every input, which is what the stale guard asks.
// Contents are untouched, so no output digest or dependant's fingerprint
// changes. A step without required files (a check) has nothing to move.

import { existsSync } from "node:fs";
import { utimes } from "node:fs/promises";
import path from "node:path";

/**
 * @param {{ repoRoot: string, required: string[] }} resolved
 * @param {{ ms: number, path: string | null }} newestInput
 * @param {{ ms: number, path: string | null } | null} newestOutput
 * @returns {Promise<string>} a note for the reason line, or "" when nothing moved
 */
export async function touchStaleOutputs(resolved, newestInput, newestOutput) {
  if (resolved.required.length === 0 || newestInput.path === null) return "";
  if (newestOutput !== null && newestOutput.path !== null && newestInput.ms <= newestOutput.ms) return "";
  const now = new Date();
  let touched = 0;
  for (const file of resolved.required) {
    if (!existsSync(file)) continue;
    await utimes(file, now, now);
    touched += 1;
  }
  const shown = path.relative(resolved.repoRoot, newestInput.path).split(path.sep).join("/");
  return `; ${touched} required output(s) touched, because ${shown} is newer than every output`;
}
