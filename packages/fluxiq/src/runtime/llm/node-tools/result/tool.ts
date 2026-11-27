// `core.set_result_processing` as a loop offers it (t970): the Flow's result
// processing, set or changed at any point, apart from the Flow's steps.
//
// It observes nothing and changes nothing on the target, so it is never a step:
// what it sets is held on the draft (`../../../flow-authoring/draft/result-processing/held.ts`)
// and written onto the Flow's record outputs as it is assembled, and its answer
// is the result as the processing makes it from the rows already read
// (`./answer.ts`). Its words name rows and columns, never a page, a site or a
// task: the guidance a model is given never mirrors a scenario (AGENTS.md).

import { AUTOMATION_STUDIO_RECORD_PATTERN_CHARACTERS } from "@fluxiq/contracts/automation";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID } from "./tool-id.ts";

// The pattern flavour is said outright (t1070): run `run-mwyg0x66-4d561a42` wrote PCRE's `(?i)` fourteen times,
// and nothing it was shown said the patterns are JavaScript's.
const DESCRIPTION = [
  "Inspect or explicitly amend declarative result processing. Held criteria apply automatically as source evidence arrives and on every saved run, without a processing model call, page change or step.",
  "Keep full source fields, including hidden conditions, marks and sort keys; columns only controls display. Missing evidence must be captured, never silently dropped or guessed.",
  "process: where [{field, is: present|absent, atLeast, atMost, lessThan, greaterThan, within, equals, contains, startsWith, endsWith, matches, not}]; anyOf [[conditions], ...] (a row passes when every condition of any one group holds); compare [{field, lessThan: otherField}]; derive [{id, from, pattern, as: number|date|text}]; dedupe {by}; sort [{field, order: asc|desc, as: number|date|text}]; limit; minRows; columns. Bounds compare numbers or written dates with as: date.",
  `matches and pattern are JavaScript regex (not PCRE), at most ${AUTOMATION_STUDIO_RECORD_PATTERN_CHARACTERS} characters: bare ignores case, /source/flags sets flags, a leading (?i), (?m) or (?s) is that flag. A list keeps a row when any one holds; with not: true it leaves it out.`,
  "A refusal names each refused part, its field, operator and why: correct that part.",
  "An automatic amendment requires why naming changed source evidence or the person's correction. Identical criteria read back the same account; do not repeat calls to make processing run. Never supply declaration/source/revision/bindings metadata.",
  "A direct task may still lack its first semantic declaration: capture actual schema, then declare the requested process with why. Only while that first declaration is missing, process: null with why may declare action-only N/A; an explicit records/output requirement or existing data criteria cannot be erased this way.",
  "The answer reports kept rows and removal counts. clear: true amends automatic criteria to {} with why; it retains automatic identity/readiness. On a legacy task clear removes the held declaration.",
  "Rows a later step acts on are still narrowed by that read's where."
].join(" ");

/** A fresh copy each time, so no loop can change what the next one offers. */
export function automationStudioLlmSetResultProcessingTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID,
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        process: { type: ["object", "null"], description: "The whole data declaration; null may explicitly complete only a missing first action-only declaration." },
        clear: { type: "boolean", description: "true removes the declaration held, in place of process." },
        dataset: { type: "string", maxLength: 200, description: "The list it shapes, when the result is not the one meant; absent, the result." },
        why: { type: "string", maxLength: 500 }
      },
      additionalProperties: false
    },
    effect: "observe"
  };
}
