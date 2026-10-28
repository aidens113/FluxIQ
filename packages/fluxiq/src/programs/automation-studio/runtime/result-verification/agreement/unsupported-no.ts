import type { AutomationStudioResultEarlierAdvice, AutomationStudioResultRepairDirective, AutomationStudioResultVerdict, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultRefutedReading, type AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict/index.ts";
import { automationStudioResultDefectsLocated } from "../located-defects/index.ts";

type Verification = AutomationStudioResultVerification;
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

/** Core's own findings that locate a defect themselves: rows a yes passed over, and rows a text condition left out that state a kept number (`../verdict/`). */
const CORE_LOCATED: ReadonlySet<string> = new Set([
  AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem,
  AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutStatingAKeptNumber
]);

/**
 * The one re-ask of each no that names no defect Core can find in its record
 * (header, `./index.ts`, t752), after every other re-ask. `calls` are each
 * call's latest answer that came back usable. On a double no where no no names
 * a defect Core finds, each is asked once more; on a split (`verdicts_disagree`)
 * whose no names none, that no is. The recheck asks for each defect in
 * `defects`, quoting the request, says a concern that is no defect is advice
 * beside a yes, and, where this revision changed what an earlier judge of the
 * build advised (`summary.earlierAdvice`), that a change proves neither advice
 * compliance nor correctness and the original request still governs. Each
 * answer takes its place under the agreement's rule (`agree`), except a no that
 * still names no defect Core finds, or a re-ask that did not come back usable:
 * that call counts for nothing (`unsupportedNo`). Beside a no that names one
 * the verdict stays no; otherwise the outcome is unsure
 * (`refutationUnsupported`) -- never a no, and never a yes Core made. A double
 * no where a no names a defect Core finds is no as it was, and nothing is asked
 * twice. `settled` unchanged without Core's record.
 */
export async function automationStudioResultVerificationReaskUnsupportedNo(input: {
  settled: Verification;
  calls: readonly [Verification, Verification];
  record: AutomationStudioResultNoRecord | undefined;
  summary: AutomationStudioRunResultSummary;
  ask: (recheck: string, call: 1 | 2) => Promise<Verification>;
  agree: (first: Verification, second: Verification) => Verification;
}): Promise<Verification> {
  const { settled, record, summary } = input;
  if (!record || settled.unsupportedNo) return settled;
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  const double = settled.verdict === "does_not_answer";
  if (!double && !(settled.basis === "model_disagreed" && settled.code === codes.disagree)) return settled;
  const calls: [Verification, Verification] = [input.calls[0], input.calls[1]];
  const nos = ([1, 2] as const).filter((call) => modelNo(calls[call - 1]!));
  const others = ([1, 2] as const).filter((call) => !nos.includes(call));
  if (double ? nos.length !== 2 : nos.length !== 1 || !others.every((call) => modelYes(calls[call - 1]!))) return settled;
  const weigh = (verification: Verification) => supportOf(verification, record, summary);
  const before = new Map(nos.map((call) => [call, { verification: calls[call - 1]!, ...weigh(calls[call - 1]!) }]));
  if ([...before.values()].some((one) => one.supported)) return settled;
  const asked: AutomationStudioResultVerdict[] = [];
  const notTaken = new Map<1 | 2, string[]>();
  for (const call of nos) {
    const was = before.get(call)!;
    const again = await input.ask(recheckWords(was.findings, summary.earlierAdvice), call);
    asked.push(again.verdict);
    if (again.basis !== "model") {
      notTaken.set(call, was.findings);
      continue;
    }
    calls[call - 1] = again;
    const now = modelNo(again) ? weigh(again) : undefined;
    if (now && !now.supported) notTaken.set(call, now.findings);
  }
  const verdicts = [...(settled.verdicts ?? []), ...asked];
  if (!notTaken.size) {
    const again = input.agree(calls[0], calls[1]);
    // A no asked again that answered yes leaves its concern as that yes's advice, as a split's no does (`./reask-split-no.ts`).
    const concern = again.verdict === "answers" ? nos.map((call) => concernOf(before.get(call)!.verification)).find(Boolean) : undefined;
    return { ...again, verdicts, calls: verdicts.length, ...(concern ? { answeredReading: { ...again.answeredReading, advice: concern } } : {}) };
  }
  const unsupportedNo = { calls: [...notTaken.keys()].sort(), findings: [...notTaken].flatMap(([call, findings]) => findings.map((finding) => `Judge call ${call}: ${finding}`)), reasked: true as const };
  const taken = ([1, 2] as const).filter((call) => !notTaken.has(call)).map((call) => calls[call - 1]!);
  // One no that names a defect Core finds keeps the verdict no, weighed as the agreement weighs a no both calls gave.
  const standing = taken.find(modelNo);
  if (standing) return { ...input.agree(standing, standing), verdicts, calls: verdicts.length, unsupportedNo };
  const yes = taken.find(modelYes);
  const basis = yes ? "model_disagreed" as const : "model_unconfirmed" as const;
  const reading = labelled([...notTaken.keys()].map((call) => ({ call, reading: (modelNo(calls[call - 1]!) ? calls[call - 1]! : before.get(call)!.verification).repair?.judgement })), record);
  const both = notTaken.size === 2;
  return {
    schemaVersion: settled.schemaVersion,
    verdict: "unsure",
    basis,
    code: codes.refutationUnsupported,
    // Core's words only: a run records the reason, and the rows a judge named are in `unsupportedNo` beside it.
    reason: `This result was checked with the same evidence, and ${both ? "both checks" : "a check"} answered that it does not do what was asked without naming a defect Core can find in its own record of this run: a row the result keeps that the request does not ask for, a row the request asks for that it lacks, a wrong value, or an act missing or done wrong by a step it took, each with the request's own words. Asked once more to list each, ${both ? "neither" : "it"} named one, so ${both ? "neither no is" : "that no is not"} taken. ${UNSETTLED[basis].run}`,
    observation: settled.observation,
    verdicts,
    calls: verdicts.length,
    unsupportedNo,
    ...(reading ? { unconfirmedReading: reading } : {}),
    ...(yes?.answeredReading ? { answeredReading: { ...yes.answeredReading } } : {}),
    // Core's record of the judged build test, for the gate that keeps the build's trials (`./standing-record.ts`); never model-facing.
    ...(settled.standingNo ? { standingNo: settled.standingNo } : {})
  };
}

function modelNo(verification: Verification): boolean {
  return verification.basis === "model" && verification.verdict === "does_not_answer";
}

function modelYes(verification: Verification): boolean {
  return verification.basis === "model" && verification.verdict === "answers";
}

/**
 * Whether a no names a defect Core finds (`./located-defects/`), with Core's
 * words for each it does not. A no Core made itself, refusing a yes over rows
 * it found, stands on Core's own finding.
 */
function supportOf(verification: Verification, record: AutomationStudioResultNoRecord, summary: AutomationStudioRunResultSummary): { supported: boolean; findings: string[] } {
  if ((verification.repair?.findings ?? []).some((finding) => CORE_LOCATED.has(finding.code))) return { supported: true, findings: [] };
  // Persisted legacy diagnoses may omit this optional list and keep the existing prose-weighing rules. Current negative replies cannot reach here without a list: the task-specific harness decoder rejects omission.
  const defects = verification.repair?.judgement?.defects;
  if (defects === undefined) return { supported: true, findings: [] };
  if (!defects.length) return { supported: false, findings: ["It listed no defect."] };
  const found = automationStudioResultDefectsLocated(defects, { record, summary });
  return { supported: found.located.length > 0, findings: found.findings };
}

/**
 * What a no that named no defect Core finds is asked once more (header). Core's
 * words, naming no site or task; Core's findings of that answer last, after a
 * marker, since they quote what the judge named.
 */
function recheckWords(findings: readonly string[], earlier: readonly AutomationStudioResultEarlierAdvice[] | undefined): string {
  const followed = (earlier ?? []).filter((advice) => advice.followed === "changed").map((advice) => advice.revision);
  const advised = !followed.length ? ""
    : followed.length === 1 ? `This revision changed a step or condition named by the judge of revision ${followed[0]}. That change does not prove the advice was followed or correct. Earlier advice is context only: judge the result against the original request, including defects introduced by that advice. `
      : `This revision changed steps or conditions named by the judges of revisions ${followed.slice(0, -1).join(", ")} and ${followed[followed.length - 1]}. That change does not prove the advice was followed or correct. Earlier advice is context only: judge the result against the original request, including defects introduced by that advice. `;
  return "This same evidence was judged before, and that answer said the result does not answer the request, but named no defect Core can find in this result. "
    + advised
    + "Answer no only for a defect of this result, and list each defect in defects: kept_not_asked for a row it keeps that the request does not ask for, asked_missing for a row the request asks for that it lacks, or wrong_value for a kept row whose column holds a wrong value; and for an act the request asks for, act_missing for an act no step does, or act_wrong for a step, named in step, that did its act to the wrong thing, with the wrong value or with no effect the evidence shows. "
    + "Name each row as the evidence names it, and quote in requestWords the request's own words it fails. "
    + "For a claim about kept or dropped rows, name the row when the evidence identifies it. Ordering, formatting, missing columns, actions, and constraints not measurable from these rows can still violate the original request: report them in observed and do not answer yes unless the evidence independently supports correctness. "
    + "A concern about another possible run alone is advice. An absent structured row defect does not establish correctness: answer unknown when the evidence cannot settle a requirement, and answer yes only after independently checking every requirement of the original request."
    + (findings.length ? ` What Core found of that answer: ${findings.join(" ")}` : "");
}

/** What a no was concerned about, as screened for its reading: its advice, else what it observed. */
function concernOf(no: Verification): string | undefined {
  const judgement = no.repair?.judgement;
  return judgement?.advice ?? judgement?.observed;
}

/** The readings of the nos not taken, each field labelled with its call, as `../refuted-no/reask.ts` labels a refuted reading. */
function labelled(readings: ReadonlyArray<{ call: 1 | 2; reading: Reading | undefined }>, record: AutomationStudioResultNoRecord): { expected?: string; observed?: string; advice?: string; recordContradicts?: "whole" | "part" } | undefined {
  const weighed = readings.map((one) => ({ ...one, refuted: automationStudioResultRefutedReading(one.reading, record) }));
  const field = (name: "observed" | "advice"): string | undefined => {
    const parts = weighed.filter((one) => one.reading?.[name]).map((one) => {
      const contradiction = one.refuted.findings.length ? `Core's record contradicts ${one.refuted.wholly ? "this reading" : "part of this reading"}: ${one.refuted.findings.join(" ")}` : "no defect Core can find in this result";
      return `Judge call ${one.call} (${contradiction}): ${one.reading![name]}`;
    });
    return parts.length ? parts.join(" ") : undefined;
  };
  const expected = readings.find((one) => one.reading?.expected)?.reading?.expected;
  const observed = field("observed");
  const advice = field("advice");
  const contradicted = weighed.filter((one) => one.refuted.findings.length);
  const recordContradicts = contradicted.length ? (contradicted.length === weighed.length && contradicted.every((one) => one.refuted.wholly) ? "whole" as const : "part" as const) : undefined;
  const said = { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}), ...(advice ? { advice } : {}), ...(recordContradicts ? { recordContradicts } : {}) };
  return Object.keys(said).length ? said : undefined;
}
