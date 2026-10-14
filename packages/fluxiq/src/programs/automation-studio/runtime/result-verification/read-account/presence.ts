// What a presence test found on both sides of it, said for the judge (t574).
//
// **Why.** A condition that keeps a row only when its read finds a value --
// `column is present`, nothing else -- was said by its wording and, on the rows
// it alone left out, by their labels and a witness `state: absent`. Nothing
// said what it looked for on the rows it kept, nor that "absent" was the
// condition holding rather than the read failing. Live run
// `run-mv7vor5f-ea4d08b4`'s judges refuted an exact answer twice as "a broken
// read" of such a marker, and the earlier whole-candidate run's judges left
// four exact answers unconfirmed on the same doubt.
//
// **What is said, and only what was measured.** That the condition kept no row
// without a value, so its read found one on every row it kept -- which is what
// the condition is -- with the one such value the read reports (its
// `conditions.seen`), screened as a condition's wording is; and that on each
// row it alone left out the same read found none, which is why that row is
// left out. `accounts.ts` says each such row `label — column: (no value)`.
// Never a value Core did not read, and nothing for a condition that also
// compares, or is negated.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioEvidenceKey, automationStudioLocatorShapedText, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** Keys that name the value a condition tests, rather than saying something about it. */
const NAMING_KEYS: ReadonlySet<string> = new Set(["field", "read"]);

/** Core's sentence for a presence test (header); `undefined` for any other condition. `seen` is the value its read found on a row it held for. */
export function automationStudioResultReadPresence(condition: JsonValue | undefined, deniedKeys: readonly string[], seen: JsonValue | undefined): string | undefined {
  if (!isRecord(condition) || condition.is !== "present" || condition.not === true) return undefined;
  const relations = Object.keys(condition).filter((key) => !NAMING_KEYS.has(key) && key !== "not" && condition[key] !== null && condition[key] !== undefined);
  if (relations.length !== 1) return undefined;
  const found = foundText(seen, deniedKeys);
  return `A row is kept only when this condition's read finds a value on it: the read found one on every row it kept${found ? ` (on one of them, ${found})` : ""}, and found none on each row it alone left out, each said with (no value).`;
}

/** The value quoted and whole, or `undefined` when there is none or it may not be said: a declared key, locator-shaped or secret-shaped. */
function foundText(seen: JsonValue | undefined, deniedKeys: readonly string[]): string | undefined {
  if (typeof seen !== "string") return undefined;
  const trimmed = seen.trim();
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  if (!trimmed || denied.has(automationStudioEvidenceKey(trimmed))) return undefined;
  if (automationStudioLocatorShapedText(trimmed) || screenAutomationStudioLlmEvidence(trimmed, []).secretShaped) return undefined;
  return JSON.stringify(trimmed);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
