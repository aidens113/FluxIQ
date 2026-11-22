// One trail value as a judge may be shown it (`./trail.ts`): screened member by member, so one credential in a page
// withholds that member and never the rest of what was found, and made the same for the same evidence.
//
// **Screened.** A member under a denied key, or a string shaped like a credential, is replaced by a marker and sets
// `withheld`. A provider refuses a request with either anywhere in it (`../../llm/harness/request-evidence-check.ts`).
// A locator-shaped run inside a string is rewritten (`../../llm/screening/locator-text.ts`), as every judge's evidence
// is, and does not set `withheld`: a call's own selectors say how it was addressed, never what the site showed, and a
// summary marked withheld for them would read as missing evidence on every list read.
//
// **The same evidence, the same request (t963, J2).** A member that says only when something ran or under which
// minted id -- a number under a key ending `At` or `Ms`, or a string shaped like a generated UUID -- is left out:
// it differs on every call while what the site showed does not, and the request is built only from what was found.
// Nothing else is dropped or cut.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioEvidenceKey, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** Stands in for a value that may not be sent. */
const WITHHELD = "[withheld]";
/** A time or a duration: when it ran, never what it found. */
const WHEN_KEY = /(?:At|Ms)$/u;
/** A generated id. */
const MINTED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** `value` as it may be sent, and whether anything was withheld or rewritten; `undefined` for a member to leave out. */
export function automationStudioResultTrailScreened(value: JsonValue | undefined, deniedEvidenceKeys: readonly string[]): { value?: JsonValue; withheld: boolean } {
  const denied = new Set(deniedEvidenceKeys.map(automationStudioEvidenceKey));
  let withheld = false;
  const walk = (item: JsonValue): JsonValue | undefined => {
    if (typeof item === "string") {
      if (MINTED.test(item.trim())) return undefined;
      if (screenAutomationStudioLlmEvidence(item, []).secretShaped) {
        withheld = true;
        return WITHHELD;
      }
      return automationStudioWithoutLocators(item);
    }
    if (Array.isArray(item)) return item.flatMap((entry) => {
      const shown = walk(entry);
      return shown === undefined ? [] : [shown];
    });
    if (item !== null && typeof item === "object") {
      const shown: JsonObject = {};
      for (const [key, member] of Object.entries(item)) {
        if (member === undefined) continue;
        if (typeof member === "number" && WHEN_KEY.test(key)) continue;
        if (denied.has(automationStudioEvidenceKey(key))) {
          withheld = true;
          shown[key] = WITHHELD;
          continue;
        }
        const kept = walk(member);
        if (kept !== undefined) shown[key] = kept;
      }
      return shown;
    }
    // A value JSON has no form for is left out, as an `undefined` member is: one kept would have the provider refuse the whole request unsent (t974).
    const scalar: unknown = item;
    if (typeof scalar === "function" || typeof scalar === "symbol" || typeof scalar === "bigint" || scalar === undefined) return undefined;
    return typeof item === "number" && !Number.isFinite(item) ? null : item;
  };
  if (value === undefined) return { withheld: false };
  const shown = walk(value);
  return { ...(shown !== undefined ? { value: shown } : {}), withheld };
}
