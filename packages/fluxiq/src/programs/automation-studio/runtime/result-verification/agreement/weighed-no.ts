import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { automationStudioResultRefutedReading, type AutomationStudioResultNoWeighed } from "../refuted-no/index.ts";
import { noRecordOf } from "./no-record.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";

/** What Core's record says of one call's no (t607), whether or not it refutes all of it; nothing without the summary, or for a call that did not say no. */
function weighedNo(input: AutomationStudioResultVerificationAgreementInput, call: 1 | 2): AutomationStudioResultNoWeighed | undefined {
  const record = noRecordOf(input);
  const verification = call === 1 ? input.first : input.second;
  if (!record || !verification || verification.basis !== "model" || verification.verdict !== "does_not_answer") return undefined;
  return automationStudioResultRefutedReading(verification.repair?.judgement, record);
}

/** Core's findings on each no among the two calls whose every reason its record refutes (t607); none without the summary. */
function refutedFindings(input: AutomationStudioResultVerificationAgreementInput): Map<1 | 2, string[]> {
  const found = new Map<1 | 2, string[]>();
  for (const call of [1, 2] as const) {
    const weighed = weighedNo(input, call);
    if (weighed?.wholly) found.set(call, weighed.findings);
  }
  return found;
}

/** What Core's record says of each no among the two calls where it refutes any of it, wholly or in part (header, t641); none without the summary. */
export function weighedNos(input: AutomationStudioResultVerificationAgreementInput): Map<1 | 2, AutomationStudioResultNoWeighed> {
  const found = new Map<1 | 2, AutomationStudioResultNoWeighed>();
  for (const call of [1, 2] as const) {
    const weighed = weighedNo(input, call);
    if (weighed?.findings.length) found.set(call, weighed);
  }
  return found;
}

/** `{ refutedNo }` naming those of `calls` whose no Core's record wholly refutes, to be asked once more (t607); nothing otherwise. */
export function refutedMark(input: AutomationStudioResultVerificationAgreementInput, calls: ReadonlyArray<1 | 2>): { refutedNo?: NonNullable<AutomationStudioResultVerification["refutedNo"]> } {
  const found = refutedFindings(input);
  const marked = calls.filter((call) => found.has(call));
  // Beside a no the record leaves standing, a refuted no is only labelled: the standing one keeps the verdict no (t501).
  if (!marked.length || (calls.length === 2 && marked.length < 2)) return {};
  return { refutedNo: { calls: marked, findings: [...new Set(marked.flatMap((call) => found.get(call)!))] } };
}

/** What Core's record says of a split's or unsure's no, with its call, where it refutes any of it (header, t628, t652); nothing otherwise. */
export function splitRefuted(input: AutomationStudioResultVerificationAgreementInput, call: 1 | 2): ({ call: 1 | 2 } & AutomationStudioResultNoWeighed) | undefined {
  const weighed = weighedNo(input, call);
  return weighed?.findings.length ? { call, ...weighed } : undefined;
}
