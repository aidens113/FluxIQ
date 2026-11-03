import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import type { AutomationStudioResultStandingNoRecord } from "../standing-no/index.ts";
import { automationStudioResultStandingNoRecord } from "../standing-no-record/index.ts";
import { noRecordOf } from "./no-record.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";

/** `outcome` with Core's record of the judged build test where it has none yet (header, t652); never for a runtime check or one call. */
export function recorded(input: AutomationStudioResultVerificationAgreementInput, outcome: AutomationStudioResultVerification): AutomationStudioResultVerification {
  if (outcome.standingNo || (outcome.calls ?? 0) < 2) return outcome;
  const record = standingNoOf(input);
  return record.standingNo ? { ...outcome, ...record } : outcome;
}

/**
 * `{ standingNo }`: Core's record of a build test two calls judged (header,
 * t633, t652, `../standing-no-record/record.ts`); nothing for a runtime check,
 * or without the judged summary.
 */
export function standingNoOf(input: AutomationStudioResultVerificationAgreementInput): { standingNo?: AutomationStudioResultStandingNoRecord } {
  const record = input.confirmAnswer === true ? noRecordOf(input) : undefined;
  if (!record || !input.summary || !input.second) return {};
  const calls = [{ call: 1 as const, verification: input.first }, { call: 2 as const, verification: input.second }];
  return { standingNo: automationStudioResultStandingNoRecord({ calls, record, summary: input.summary, wording: input.wording }) };
}
