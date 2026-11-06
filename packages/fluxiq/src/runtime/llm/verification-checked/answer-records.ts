// What a result verification's yes says of the records a request asks for
// (t875, lane A, run `run-mw4b7kav-cbff03e1`): whether the request asks for
// records as its answer, and how many the site shows as that answer. A judge
// that wrote "the list now shows 5" over 3 stored rows and said yes had checked
// the columns, not the rows; with the count as a field, Core compares it with
// the rows the result holds (`../../result-verification/cited-yes/records-yes.ts`)
// instead of reading a number out of prose.
//
// One source for the shape, as `./schema.ts` is for the cited cells: the
// verification's schema offers it and the reply check holds a value to it.

/** The shape of `diagnosis.answerRecords`: `asked`, whether the request asks for records as its answer; `siteShows`, how many records the site shows as that answer, 0 where it shows none. */
export const AUTOMATION_STUDIO_LLM_VERIFICATION_ANSWER_RECORDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["asked"],
  properties: {
    asked: { type: "boolean" },
    siteShows: { type: "integer", minimum: 0 }
  }
} as const;

/** The value as Core reads it. */
export type AutomationStudioLlmVerificationAnswerRecords = { asked: boolean; siteShows?: number };

const KEYS: readonly string[] = Object.keys(AUTOMATION_STUDIO_LLM_VERIFICATION_ANSWER_RECORDS_SCHEMA.properties);

/**
 * `value` rebuilt key by key where it is well formed: an object with no key but
 * `asked` and `siteShows`, `asked` a flag, `siteShows` absent or a whole number
 * not below 0. Nothing where it is not, so nothing rides in beside it.
 */
export function automationStudioLlmWellFormedAnswerRecords(value: unknown): AutomationStudioLlmVerificationAnswerRecords | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !KEYS.includes(key))) return undefined;
  if (typeof record.asked !== "boolean") return undefined;
  const shows = record.siteShows;
  if (shows === undefined) return { asked: record.asked };
  if (typeof shows !== "number" || !Number.isSafeInteger(shows) || shows < 0) return undefined;
  return { asked: record.asked, siteShows: shows };
}
