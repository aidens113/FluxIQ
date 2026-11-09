// What a judge's reply must carry, said once (t875, lane B `run-mw4coxdn-e2b30c8c`).
// Under Anthropic's native grammar (`../../models/providers/anthropic/schema.ts`)
// a judge may write only what the schema's `required` names, and Sonnet wrote
// `answersRequest`, `defects`, two flags and an empty `summary`: Core's reader
// refused the empty summary and the yes was not judged. So the schema every
// provider is offered (`../provider-task/output-schema.ts`) takes its `required`
// from here, and the reader is held to the same table (`./tests/`,
// `../anthropic/tests/judge-required.test.ts`):
//
// - `kind`, `diagnosis`, `summary` on the reply. The reader needs `summary` to be
//   a string; a blank one is read as no summary, since a judge's summary is prose
//   nothing acts on and no grammar can ask for a non-empty string
//   (`../harness/provider-result.ts`).
// - `answersRequest`, always: without it nobody said, and the check is not judged.
// - `defects`, which the reader refuses a no without (t752); empty on a yes.
// - On the judge of an attempt with no Flow only, `checked` and `answerRecords`:
//   a yes over rows must cite them and say what the site shows
//   (`../../result-verification/cited-yes/records-yes.ts`), and is asked again
//   without them. Required here so an honest yes is not asked again for leaving
//   them out; `checked` may be empty, as it is on a no or over no rows.

/** The `metadata.source` the Flow-less judge's calls carry (`../../result-verification/flow-less/judge.ts`). `../provider-task/system-prompt.ts` reads the same word. */
export const AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE = "answerFirstJudge";

/** The members every judge reply carries. */
export const AUTOMATION_STUDIO_LLM_VERIFICATION_REPLY_REQUIRED = ["kind", "diagnosis", "summary"] as const;

/** Each diagnosis key a judge must write, with when Core's reader needs it (header). */
export const AUTOMATION_STUDIO_LLM_VERIFICATION_DIAGNOSIS_NEEDS = [
  { key: "answersRequest", needed: "always" },
  { key: "defects", needed: "on_no" },
  { key: "checked", needed: "flow_less_yes_over_rows" },
  { key: "answerRecords", needed: "flow_less_yes" }
] as const;

/** The diagnosis keys a judge's schema requires: the Flow-less judge's all four, every other judge's the first two. */
export function automationStudioLlmVerificationDiagnosisRequired(flowLess: boolean): string[] {
  return AUTOMATION_STUDIO_LLM_VERIFICATION_DIAGNOSIS_NEEDS.filter((need) => flowLess || !need.needed.startsWith("flow_less")).map((need) => need.key);
}
