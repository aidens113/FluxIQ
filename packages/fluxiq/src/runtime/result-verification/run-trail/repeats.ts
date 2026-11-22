// A page view the judge was already shown is shown once (t978). Live run `run-mwoxglkg-e37fd49b`: each judge was sent a
// 302 KB trail, 95% of it entries' `found`, and 22 of the 31 page-view sub-fields (`fields`, `page`, `view`) were
// byte-identical to an earlier entry's: replays read the same page again. Nothing is dropped or summarised: only an exact
// repeat of a member's serialised value is replaced, by a reference to the first entry that holds it. The first holder is
// never replaced. Applied where the trail is built, before any fitting (`./fitting.ts`, `./window.ts`) measures it.

import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioResultTrailShownStep } from "../contracts/index.ts";
import { AutomationStudioJudgeEvidenceRetry } from "../judge-evidence/retry.ts";

/** A member this short is no cheaper as a stub, and is often a flag or a count that merely happens to match. */
const STUB_MINIMUM_CHARACTERS = 120;

/** `entries` with each large `found` member that repeats an earlier entry's, byte for byte, as `{ sameAs }` naming that entry's callId, or `n:<its n>` where it has none. */
export function automationStudioResultTrailRepeatsOnce(entries: readonly AutomationStudioResultTrailShownStep[]): AutomationStudioResultTrailShownStep[] {
  const first = new Map<string, string>();
  return entries.map((entry) => {
    const found = entry.found;
    if (found === null || typeof found !== "object" || Array.isArray(found)) return entry;
    const holder = entry.callId ?? `n:${entry.n}`;
    let changed = false;
    const members: Record<string, JsonValue> = {};
    for (const [name, value] of Object.entries(found)) {
      const text = JSON.stringify(value);
      if (value === undefined || text === undefined || text.length < STUB_MINIMUM_CHARACTERS) {
        members[name] = value as JsonValue;
        continue;
      }
      const key = `${name}\u0000${text}`;
      const earlier = first.get(key);
      if (earlier === undefined) {
        first.set(key, holder);
        members[name] = value;
      } else {
        members[name] = { sameAs: earlier };
        changed = true;
      }
    }
    if (!changed) return entry;
    const result = { ...entry, found: members };
    AutomationStudioJudgeEvidenceRetry.carry(entry, result);
    return result;
  });
}
