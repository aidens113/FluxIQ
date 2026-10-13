// What a failed step's own node said was wrong with it, for the trial feedback
// (t489, F3).
//
// Lane D round 13 (`run-mv66sc3c-c47e74b8`, trials 2 to 4) failed its last read
// `record_output.invalid` three times. The node's result carried the reason --
// `outputs.error.issues: ["record_output.process_unknown_field"]` -- and the
// feedback dropped it, saying only "The step names a node that cannot run".
// The model knew which step failed and not what was wrong, so it resubmitted
// the same script from memory until the repeat guard ended the build.
//
// A failed step now lists `issues`, read from `outputs.error.issues` as the
// node wrote them. An entry is either a code, or an object naming the code, the
// `field` it refused and, where the node knows them, the `valid` names it can
// use instead. Only identifiers pass: a code shaped like one of the producers'
// dotted codes, and a field or name made of identifier characters, so no page
// sentence, value or locator reaches the model through here. Anything else in
// the list is dropped whole.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** A producer's dotted code (`record_output.process_unknown_field`). */
const CODE = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/u;
/** A field id or name a node stores: identifier characters only, so never a sentence or a page value. */
const NAME = /^[A-Za-z0-9_.:-]+$/u;
const MAX_CODE = 120;
const MAX_NAME = 120;

/** The issues the failed step's node gave for itself, each a code with the field and valid names it named (header); empty when it gave none. */
export function automationStudioTrialStepIssues(outputs: Readonly<Record<string, JsonValue>> | undefined): JsonObject[] {
  const error = outputs?.error;
  if (!isObject(error) || !Array.isArray(error.issues)) return [];
  const seen = new Set<string>();
  const said: JsonObject[] = [];
  for (const entry of error.issues) {
    const issue = issueOf(entry);
    if (!issue) continue;
    const key = JSON.stringify(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    said.push(issue);
  }
  return said;
}

function issueOf(entry: JsonValue): JsonObject | undefined {
  if (typeof entry === "string") return isCode(entry) ? { code: entry } : undefined;
  if (!isObject(entry) || typeof entry.code !== "string" || !isCode(entry.code)) return undefined;
  const field = typeof entry.field === "string" && isName(entry.field) ? entry.field : undefined;
  const valid = Array.isArray(entry.valid) ? [...new Set(entry.valid.filter((name): name is string => typeof name === "string" && isName(name)))] : [];
  return { code: entry.code, ...(field !== undefined ? { field } : {}), ...(valid.length ? { valid } : {}) };
}

const isCode = (value: string): boolean => value.length <= MAX_CODE && CODE.test(value);
const isName = (value: string): boolean => value.length <= MAX_NAME && NAME.test(value);
const isObject = (value: JsonValue | undefined): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
