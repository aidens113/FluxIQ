// Core's own note on a before side it holds no reading from before for (t1043): the words the judge is told when acts
// an earlier attempt made are carried into this attempt and the reading from before them is not held
// (`framework/.../answer-first/witnesses/`, `./earlier-before-words.ts`). It is Core's metadata about its own readings,
// never a reading of the page.
//
// **Why it is recognised here.** Run `run-mww6euuw-ecdb20f8` carried an act attempt 1 made into attempt 2 with no
// reading from before it, so attempt 2's before side was this note. It went through the host's judge-evidence projector
// as page state; the web projector cannot read Core's words (`web_judge.evidence_unrecognized`), Core named that a gap,
// and every yes was held unsure with nothing any act or read could clear. The note is now Core's to account for, as
// Core's own calls are (`./core-call.ts`): it reaches the judge in Core's own words (`./project.ts`), and only the
// reading beside it, which is page state, goes to the host.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_JUDGE_EARLIER_BEFORE_WORDS } from "./earlier-before-words.ts";

/** The note as the witnesses show it: Core's words, and this attempt's own reading beside them where it took one. */
export type AutomationStudioJudgeEarlierBeforeNote = { note: string; reading?: JsonObject };

const WORDS: ReadonlySet<string> = new Set(Object.values(AUTOMATION_STUDIO_JUDGE_EARLIER_BEFORE_WORDS));

/** The note Core wrote, or nothing for any other value: exactly Core's words, and nothing beside them but a reading. */
export function automationStudioJudgeEarlierBeforeNote(value: JsonValue | undefined): AutomationStudioJudgeEarlierBeforeNote | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (typeof value.note !== "string" || !WORDS.has(value.note)) return undefined;
  if (Object.keys(value).some((key) => key !== "note" && key !== "reading")) return undefined;
  const reading = value.reading;
  if (reading === undefined) return { note: value.note };
  return reading !== null && typeof reading === "object" && !Array.isArray(reading) ? { note: value.note, reading } : undefined;
}
