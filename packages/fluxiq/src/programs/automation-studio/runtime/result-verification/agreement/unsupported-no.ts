import type { AutomationStudioResultEarlierAdvice, AutomationStudioResultRepairDirective, AutomationStudioResultVerdict, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultRefutedReading, automationStudioResultRefutedRowsRecheck, type AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict/index.ts";
import { automationStudioResultDefectsLocated, type AutomationStudioResultRefutedDefect } from "../located-defects/index.ts";

type Verification = AutomationStudioResultVerification;
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;
type RefutedRow = NonNullable<Verification["refutedRows"]>[number];
/** What Core's record says of one no: whether it names a defect Core finds, Core's words for each it does not, and each defect Core's record of its row refutes, `wholly` where that is every defect, at least one (t810). */
type Support = { supported: boolean; findings: string[]; refuted: AutomationStudioResultRefutedDefect[]; wholly: boolean };

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
 *
 * **A lone yes beside nos Core refused every one of (t771, lead decision
 * 2026-10-27).** Rerun round 6 social `run-mvrj7qg8-c20c132e`: a trial stored
 * exactly the rows asked for; one call said yes, and the other's no, asked
 * once more, still named only rows its judge invented. The outcome was unsure
 * by this rule, and the build was never told its right answer. Such a yes is
 * asked once more (`CONFIRM_LONE_YES`), in the refused no's place: a second yes
 * stands as the agreement weighs two yeses; any other answer leaves it unsure.
 *
 * **A yes one no of a double no became, beside the other Core refused (t790).**
 * Run `run-mvswewhy-e4e469d4`: both calls said no naming nothing Core could
 * find; asked once more, one said yes and the other said no again, still
 * naming nothing Core could find. The confirming ask was guarded on every
 * first no being refused, which a double no whose re-asks split can never
 * meet, so nothing was asked and the outcome was unsure. The ask is now made
 * wherever every call Core takes is a yes and every other is a refused no, in
 * the first refused no's place: on a split exactly as before, and on such a
 * double no too. A no naming a defect Core finds still stands, and a double no
 * whose re-asks both stay refused asks nothing more. The unsure reason says
 * what each re-asked no named: none, or how many, of which Core finds none.
 *
 * **Nothing of a no Core could not ground is carried on (t771).** In that run
 * such a no's advice reached every later judge as earlier advice and the
 * repair as the unconfirmed reading, and the repair dropped the right
 * condition. The unsure outcome's `unconfirmedReading` holds only what that no
 * read the request to ask (`expected`); Core's findings stay in `unsupportedNo`.
 *
 * **A no whose every defect row Core's record of that row refutes (t810,
 * framework plan P5b).** Run `run-mvud43a2-445c7f17`: a correct Flow, and
 * every judge called left-out rows missing that were items marked outside the
 * person's set, or a row given a value its own cell does not hold, or a
 * claim about a kept row naming a row the result never held (`not_kept`,
 * `../located-defects/row-refuted.ts`). Asked the generic recheck below, they
 * repeated it, and the outcome was unsure. Such a no -- naming at least one
 * defect, every one refuted, none merely not found -- is asked once more with
 * Core's evidence for each row, in the reverse of its order, and the converse
 * question (`../refuted-no/refuted-rows-recheck.ts`), never the generic one.
 * Then (`byRowRecord`): where every call's latest answer is a no every defect
 * of which Core's record refutes, or a yes citing no cell Core refutes, the
 * result answers the request -- the yes's own outcome where one came, else
 * `noRefutedByRecord` -- with the rows recorded (`refutedRows`); a re-ask yes
 * whose citation Core refutes is unsure (`yesCitationRefuted`); a re-ask no
 * naming a defect Core finds, or one that did not come back usable, is weighed
 * as every other re-ask is, below. Nothing of the refuted nos is carried on.
 */
export async function automationStudioResultVerificationReaskUnsupportedNo(input: {
  settled: Verification;
  calls: readonly [Verification, Verification];
  record: AutomationStudioResultNoRecord | undefined;
  summary: AutomationStudioRunResultSummary;
  /** The request's text, as `../verify.ts` builds it: what a kept row's defect is read against where the request asks for every result (`../located-defects/`, framework plan P5, F3). */
  requestText?: string | undefined;
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
  const weigh = (verification: Verification) => supportOf(verification, record, summary, input.requestText);
  const before = new Map(nos.map((call) => [call, { verification: calls[call - 1]!, ...weigh(calls[call - 1]!) }]));
  if ([...before.values()].some((one) => one.supported)) return settled;
  // The rows Core's record refutes, of every no weighed here (t810), and the calls asked with them.
  const refutedRows: RefutedRow[] = [];
  const rowAsked = new Set<1 | 2>();
  const reasked = new Map<1 | 2, Verification>();
  const asked: AutomationStudioResultVerdict[] = [];
  const notTaken = new Map<1 | 2, string[]>();
  // How many defects each refused no's re-ask listed, or `undefined` where it gave no answer that could be read: the reason's words (header, t790).
  const named = new Map<1 | 2, number | undefined>();
  for (const call of nos) {
    const was = before.get(call)!;
    recordRows(refutedRows, call, was.refuted);
    // A no whose every defect row Core's record refutes is asked with that record and the converse (header, t810).
    if (was.wholly) rowAsked.add(call);
    const again = await input.ask(was.wholly ? rowsRecheck(was.refuted) : recheckWords(was.findings, summary.earlierAdvice), call);
    asked.push(again.verdict);
    reasked.set(call, again);
    if (again.basis !== "model") {
      notTaken.set(call, was.findings);
      named.set(call, undefined);
      continue;
    }
    calls[call - 1] = again;
    const now = modelNo(again) ? weigh(again) : undefined;
    if (now) recordRows(refutedRows, call, now.refuted);
    if (now && !now.supported) {
      notTaken.set(call, now.findings);
      named.set(call, again.repair?.judgement?.defects?.length ?? 0);
    }
  }
  const verdicts = [...(settled.verdicts ?? []), ...asked];
  // Where a no was asked with Core's record of its rows, what every call's latest answer comes to (header, t810).
  const byRecord = rowAsked.size ? byRowRecord({ settled, calls, reasked, rowAsked, verdicts, refutedRows, wholly: (verification) => weigh(verification).wholly }) : undefined;
  if (byRecord) return byRecord;
  // Otherwise weighed as below, the rows Core refuted kept on the outcome wherever a no was asked with them (t810 follow-up 2).
  const rowsKept = rowAsked.size && refutedRows.length ? { refutedRows } : {};
  if (!notTaken.size) {
    const again = input.agree(calls[0], calls[1]);
    // A no asked again that answered yes leaves its concern as that yes's advice, as a split's no does (`./reask-split-no.ts`).
    const concern = again.verdict === "answers" ? nos.map((call) => concernOf(before.get(call)!.verification)).find(Boolean) : undefined;
    return { ...again, verdicts, calls: verdicts.length, ...(concern ? { answeredReading: { ...again.answeredReading, advice: concern } } : {}), ...rowsKept };
  }
  const unsupportedNo = { calls: [...notTaken.keys()].sort(), findings: [...notTaken].flatMap(([call, findings]) => findings.map((finding) => `Judge call ${call}: ${finding}`)), reasked: true as const };
  const taken = ([1, 2] as const).filter((call) => !notTaken.has(call)).map((call) => calls[call - 1]!);
  // One no that names a defect Core finds keeps the verdict no, weighed as the agreement weighs a no both calls gave.
  const standing = taken.find(modelNo);
  if (standing) return { ...input.agree(standing, standing), verdicts, calls: verdicts.length, unsupportedNo, ...rowsKept };
  const yes = taken.find(modelYes);
  // A lone yes beside nos Core refused every one of is asked once more to confirm; a second yes stands (header, t771).
  // Every call Core takes is a yes and every other a refused no: a split, or a double no whose re-asks split (t790);
  // asked in the first refused no's place, which on a split is its one no.
  if (yes && taken.every(modelYes)) {
    const call = [...notTaken.keys()][0]!;
    const confirming = await input.ask(CONFIRM_LONE_YES, call);
    verdicts.push(confirming.verdict);
    if (modelYes(confirming)) return { ...input.agree(yes, confirming), verdicts, calls: verdicts.length, unsupportedNo, ...rowsKept };
  }
  const basis = yes ? "model_disagreed" as const : "model_unconfirmed" as const;
  // Nothing of a no Core could not ground is carried on: no reading, no advice (header, t771).
  const reading = expectedOf([...notTaken.keys()].map((call) => (modelNo(calls[call - 1]!) ? calls[call - 1]! : before.get(call)!.verification).repair?.judgement), record);
  const both = notTaken.size === 2;
  return {
    schemaVersion: settled.schemaVersion,
    verdict: "unsure",
    basis,
    code: codes.refutationUnsupported,
    // Core's words only: a run records the reason, and the rows a judge named are in `unsupportedNo` beside it.
    reason: `This result was checked with the same evidence, and ${both ? "both checks" : "a check"} answered that it does not do what was asked without naming a defect Core can find in its own record of this run: a row the result keeps that the request does not ask for, a row the request asks for that it lacks, a wrong value, or an act missing or done wrong by a step it took, each with the request's own words. Asked once more to list each, ${namedWords([...notTaken.keys()].map((call) => named.get(call)))}, so ${both ? "neither no is" : "that no is not"} taken. ${UNSETTLED[basis].run}`,
    observation: settled.observation,
    verdicts,
    calls: verdicts.length,
    unsupportedNo,
    ...(reading ? { unconfirmedReading: reading } : {}),
    ...(yes?.answeredReading ? { answeredReading: { ...yes.answeredReading } } : {}),
    // Core's record of the judged build test, for the gate that keeps the build's trials (`./standing-record.ts`); never model-facing.
    ...(settled.standingNo ? { standingNo: settled.standingNo } : {}),
    ...rowsKept
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
function supportOf(verification: Verification, record: AutomationStudioResultNoRecord, summary: AutomationStudioRunResultSummary, requestText: string | undefined): Support {
  if ((verification.repair?.findings ?? []).some((finding) => CORE_LOCATED.has(finding.code))) return { supported: true, findings: [], refuted: [], wholly: false };
  // Persisted legacy diagnoses may omit this optional list and keep the existing prose-weighing rules. Current negative replies cannot reach here without a list: the task-specific harness decoder rejects omission.
  const defects = verification.repair?.judgement?.defects;
  if (defects === undefined) return { supported: true, findings: [], refuted: [], wholly: false };
  if (!defects.length) return { supported: false, findings: ["It listed no defect."], refuted: [], wholly: false };
  const found = automationStudioResultDefectsLocated(defects, { record, summary, requestText });
  const refuted = found.refuted ?? [];
  return { supported: found.located.length > 0, findings: found.findings, refuted, wholly: refuted.length === defects.length };
}

/**
 * What a check comes to where a no was asked once more with Core's record of
 * its rows (header, t810), or nothing where the rule above weighs it: a re-ask
 * that did not come back usable, or a call whose latest answer is neither a
 * yes nor a no every defect of which Core's record refutes.
 */
function byRowRecord(input: {
  settled: Verification;
  calls: readonly [Verification, Verification];
  reasked: ReadonlyMap<1 | 2, Verification>;
  rowAsked: ReadonlySet<1 | 2>;
  verdicts: AutomationStudioResultVerdict[];
  refutedRows: RefutedRow[];
  wholly: (verification: Verification) => boolean;
}): Verification | undefined {
  const { settled, calls, reasked, verdicts, refutedRows } = input;
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  if ([...reasked.values()].some((again) => again.basis !== "model")) return undefined;
  const citedWrongly = [...reasked.values()].find(citationRefuted);
  if (citedWrongly) {
    return {
      schemaVersion: settled.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: codes.yesCitationRefuted,
      reason: `This result was checked with the same evidence, and every check that answered that it does not do what was asked named only rows Core's own record of each row contradicts. Asked once more with that record named, a check answered that it does, but cited a cell Core's record of the result does not hold, so its yes is not taken. ${UNSETTLED.model_unconfirmed.run}`,
      observation: settled.observation, verdicts, calls: verdicts.length, refutedRows,
      ...(citedWrongly.yesCitations ? { yesCitations: citedWrongly.yesCitations } : {})
    };
  }
  // A generic unsupported-no question cannot substitute for the mandatory
  // evidence prompt when its reply introduces refuted rows for the first time.
  if (!([1, 2] as const).every((call) => {
    const latest = calls[call - 1]!;
    return modelYes(latest) || (modelNo(latest) && input.rowAsked.has(call) && input.wholly(latest));
  })) return undefined;
  // The yes a call gave, a re-asked one first: the outcome is that yes's, with the rows Core refuted beside it.
  const yes = [...reasked.values(), ...calls].find(modelYes);
  if (yes) return { ...yes, verdicts, calls: verdicts.length, refutedRows };
  return {
    schemaVersion: settled.schemaVersion, verdict: "answers", basis: "model", code: codes.noRefutedByRecord,
    reason: "This result was checked with the same evidence, and every check answered that it does not do what was asked, naming only rows Core's own record of each row contradicts: an item marked as outside the person's set, a row whose own cell does not hold the value claimed, or a row the result does not hold called kept. Asked once more with that record named, each named only such rows again, so no answer that it does not do what was asked stands, and the result is taken to answer the request.",
    observation: settled.observation, verdicts, calls: verdicts.length, refutedRows
  };
}

/** Whether a yes cited a cell Core's record of the result does not hold (`../cited-yes/`, t810): held unsure there, or a yes still carrying a refuted citation. */
function citationRefuted(verification: Verification): boolean {
  return verification.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted || (verification.verdict === "answers" && (verification.yesCitations?.refuted.length ?? 0) > 0);
}

/** Each refuted defect of one call's no, as the verification records it, once (header, t810). */
function recordRows(rows: RefutedRow[], call: 1 | 2, refuted: readonly AutomationStudioResultRefutedDefect[]): void {
  for (const one of refuted) {
    const kind = one.defect.kind;
    if (kind !== "asked_missing" && kind !== "kept_not_asked" && kind !== "wrong_value") continue;
    const row = { call, row: one.defect.row, kind, evidence: one.evidence, quote: one.quote };
    if (!rows.some((known) => known.call === call && known.row === row.row && known.kind === kind && known.evidence === row.evidence)) rows.push(row);
  }
}

/** The recheck of a no whose every defect row Core's record refutes (header, t810): Core's evidence for each row, quoted. */
function rowsRecheck(refuted: readonly AutomationStudioResultRefutedDefect[]): string {
  return automationStudioResultRefutedRowsRecheck(refuted.map((one) => ({ row: one.defect.row, evidence: one.evidence, quote: one.quote, ...(one.defect.value !== undefined ? { value: one.defect.value } : {}) })));
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
    + "Answer no only for a defect of this result, and list each defect in defects: kept_not_asked for a row it keeps that the request does not ask for, asked_missing for a row the request asks for that it lacks, with column and value, that row's own value in the column that makes it asked for, or wrong_value for a kept row whose column holds a wrong value; and for an act the request asks for, act_missing for an act no step does, or act_wrong for a step, named in step, that did its act to the wrong thing, with the wrong value or with no effect the evidence shows. "
    + "Name each row as the evidence names it, by Core's id or its whole label, and quote in requestWords the request's own words it fails. "
    + "For a claim about kept or dropped rows, name the row when the evidence identifies it. Ordering, formatting, missing columns, actions, and constraints not measurable from these rows can still violate the original request: report them in observed and do not answer yes unless the evidence independently supports correctness. "
    + "A concern about another possible run alone is advice. An absent structured row defect does not establish correctness: answer unknown when the evidence cannot settle a requirement, and answer yes only after independently checking every requirement of the original request."
    + (findings.length ? ` What Core found of that answer: ${findings.join(" ")}` : "");
}

/**
 * What each refused no named when asked once more (header, t790), in call
 * order, for the unsure reason: how many defects its re-ask listed, of which
 * Core finds none, or `undefined` where the re-ask gave no answer that could
 * be read. Run `run-mvswewhy-e4e469d4`: the reason read "it named one", the
 * opposite of what happened.
 */
function namedWords(named: ReadonlyArray<number | undefined>): string {
  const one = (count: number | undefined): string =>
    count === undefined ? "gave no answer that could be read"
      : count === 0 ? "named none"
        : count === 1 ? "named one defect, which Core cannot find in its record"
          : `named ${count} defects, none of which Core can find in its record`;
  if (named.length < 2) return `it ${one(named[0])}`;
  const [first, second] = named.map(one);
  return first === second ? `each ${first}` : `the first ${first} and the second ${second}`;
}

/** What a no was concerned about, as screened for its reading: its advice, else what it observed. */
function concernOf(no: Verification): string | undefined {
  const judgement = no.repair?.judgement;
  return judgement?.advice ?? judgement?.observed;
}

/**
 * What a no Core could not ground carries on (header, t771): what it read the
 * request to ask, and, as Core's fact for the gates that keep a build's trials,
 * whether Core's record contradicts its reading wholly or in part
 * (`recordContradicts`, t641) -- nothing of what it observed or advised. Run
 * `run-mvrj7qg8-c20c132e`: such a no's advice, resting on rows its judge
 * invented, reached every later judge and the repair, which dropped the right
 * condition.
 */
function expectedOf(readings: ReadonlyArray<Reading | undefined>, record: AutomationStudioResultNoRecord): { expected?: string; recordContradicts?: "whole" | "part" } | undefined {
  const expected = readings.find((reading) => reading?.expected)?.expected;
  const refuted = readings.map((reading) => automationStudioResultRefutedReading(reading, record));
  const contradicted = refuted.filter((one) => one.findings.length);
  const recordContradicts = contradicted.length ? (contradicted.length === refuted.length && contradicted.every((one) => one.wholly) ? "whole" as const : "part" as const) : undefined;
  const said = { ...(expected ? { expected } : {}), ...(recordContradicts ? { recordContradicts } : {}) };
  return Object.keys(said).length ? said : undefined;
}

/**
 * The one confirming ask of a lone yes beside nos Core refused every one of
 * (header, t771): Core's words, naming no site or task.
 */
const CONFIRM_LONE_YES = "This same evidence was judged before: one check answered that the result does what the request asks, and every check that answered no named no defect Core can find in this result, even asked once more. Judge it once more from the evidence alone. "
  + "Answer yes only after checking every requirement of the original request against the stored rows, the rows each read left out with their own cells, and the steps the run took. "
  + "Answer no only for a defect of this result, listed in defects: a row it keeps that the request does not ask for, a row the request asks for that it lacks -- named by Core's id or its whole label, with the column and that row's own value in it that makes it asked for -- a wrong value, or an act missing or done wrong. Answer unknown when the evidence cannot settle a requirement.";
