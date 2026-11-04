// The type half of the table's exhaustiveness: both directions, so a code added to the lists and
// not named in the table fails to compile, and so does one named in the table that is no code.

import type { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES, FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST } from "../../flow-authoring/bootstrap/generation-failure/index.ts";
import type { AutomationStudioAnswerFirstPreModelCode } from "./table.ts";

type Codes = typeof AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES;

/** Every code a build refuses under before any model call. */
export type AutomationStudioAnswerFirstRefusedBeforeModelCode = Codes["pre_provider_validation"][number] | Codes["provider_resolution"][number] | (typeof FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST)[number];

/** Compile-time only: each line fails if the table and the lists part. */
export type AutomationStudioAnswerFirstPreModelTableIsWhole = [
  Exclude<AutomationStudioAnswerFirstRefusedBeforeModelCode, AutomationStudioAnswerFirstPreModelCode> extends never ? true : never,
  Exclude<AutomationStudioAnswerFirstPreModelCode, AutomationStudioAnswerFirstRefusedBeforeModelCode> extends never ? true : never
];
const WHOLE: AutomationStudioAnswerFirstPreModelTableIsWhole = [true, true];
export const AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL_TABLE_IS_WHOLE = WHOLE;
