import type { AutomationStudioResultRepairDirective, AutomationStudioResultVerification } from "../contracts/index.ts";
import { automationStudioResultYesCitations } from "../cited-yes/index.ts";
import { automationStudioResultScreenedJudgement } from "../judgement-screen.ts";
import { automationStudioResultRepairDirective } from "../repair-directive.ts";
import { automationStudioResultCheckedRows, automationStudioResultKeptRowsUnquoted, automationStudioResultLeftOutRowsUnaccounted, automationStudioResultLeftOutRowsUnquoted, automationStudioResultLeftOutStatingAKeptNumber } from "../request-rows/index.ts";
import { advice } from "./advice.ts";
import { callFailureWords } from "./call-failure-words.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "./codes.ts";
import { failed } from "./failed.ts";
import { automationStudioResultVerdictFromDiagnosis } from "./from-diagnosis.ts";
import { heldYesReason } from "./held-yes-reason.ts";
import { keptLine } from "./kept-line.ts";
import { keptNumberLine } from "./kept-number-line.ts";
import { automationStudioResultKeptRowsFlagged } from "./kept-rows-flagged.ts";
import { automationStudioResultScreenedDefects } from "./defects.ts";
import { automationStudioResultObservation } from "./observation.ts";
import { refusedYesReason } from "./refused-yes-reason.ts";
import { replyText } from "./reply-text.ts";
import type { AutomationStudioResultVerdictInput } from "./types.ts";
import { unaccountedLine } from "./unaccounted-line.ts";
import { unquotedLine } from "./unquoted-line.ts";
import { withoutUnaccounted } from "./without-unaccounted.ts";

/**
 * The verification a model call produces.
 *
 * `answers` is the only outcome that lets a run keep reporting success, and it
 * is reachable only from an explicit `yes`. Everything else carries a failure
 * record, so the run says what happened rather than saying nothing.
 */
export function automationStudioResultVerdict(input: AutomationStudioResultVerdictInput): AutomationStudioResultVerification {
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  const observation = automationStudioResultObservation(input.summary);
  if (input.basis === "model_unavailable") {
    // The reason is said in the chat, so it names what happened in words; the
    // exact code goes on the record beside it (live run muqk713g).
    return {
      ...failed("unsure", "model_unavailable", codes.unavailable, `The run's result was never judged: ${callFailureWords(input.failureCode)}. A result nobody checked is not a result that answers.`, observation),
      ...(input.failureCode ? { failureCode: input.failureCode } : {})
    };
  }
  const verdict = automationStudioResultVerdictFromDiagnosis(input.diagnosis);
  // Rows a text condition left out though it kept their number on another row: Core's to see, whatever was judged (t478).
  const keptNumber = automationStudioResultLeftOutStatingAKeptNumber(input.summary);
  if (verdict === "answers") {
    const unaccounted = automationStudioResultLeftOutRowsUnaccounted(input.summary, replyText(input));
    const unquoted = input.wording ? withoutUnaccounted(automationStudioResultLeftOutRowsUnquoted(input.summary, replyText(input), input.wording), unaccounted) : [];
    // The rows the result keeps that Core measured as unlike every other kept row, each named beside a quote of the request (header, t663).
    const kept = input.wording ? automationStudioResultKeptRowsUnquoted(automationStudioResultKeptRowsFlagged(input.summary, input.wording), replyText(input), input.wording) : [];
    // What the yes compared, screened as a no's is: a split shows it beside the no's (`../agreement/`, t477), and a held yes keeps it (t636).
    const read = automationStudioResultScreenedJudgement({ expected: input.diagnosis?.expected, observed: input.diagnosis?.observed }).judgement;
    const answeredReading = { ...(read?.expected ? { expected: read.expected } : {}), ...(read?.observed ? { observed: read.observed } : {}) };
    // What the yes cited it checked, held to Core's record of the stored rows (`../cited-yes/`, t810); nothing where it cited none.
    const citations = automationStudioResultYesCitations(input.summary, input.diagnosis?.checked);
    const yesCitations = citations ? { yesCitations: citations } : {};
    const advised = input.diagnosis?.patchNeeded === true;
    // A held yes that advised a change keeps the change it named, screened as a no's advice is (header, t636).
    const advisedChange = advised ? automationStudioResultScreenedJudgement({ advice: advice(input) }).judgement?.advice : undefined;
    const heldReading = { ...answeredReading, ...(advisedChange ? { advice: advisedChange } : {}) };
    if ((unquoted.length || kept.length) && !unaccounted.length && !keptNumber.length) {
      // A missing quote is a held yes, never a no, whether or not the yes also advised a change (header, t636); so is a flagged kept row left unnamed (t663).
      const proof = automationStudioResultRepairDirective({ summary: input.summary, checked: [...unquoted.map(unquotedLine), ...kept.map(keptLine)] });
      return {
        schemaVersion: "automation-studio.result-verification.v1", verdict: "unsure", basis: "model_unconfirmed",
        code: "core.result.exclusion_evidence_missing",
        reason: heldYesReason(unquoted.length > 0, kept.length > 0),
        observation, exclusionEvidenceMissing: proof.checked ?? [], ...yesCitations,
        // The call answered a plain yes and Core held it: said as a field, never left to the reason's words (t611). A yes advising a change is no plain yes.
        ...(advised ? { changeAdvised: true as const } : { yesUnconfirmed: true as const }),
        ...(Object.keys(heldReading).length ? { answeredReading: heldReading } : {})
      };
    }
    if (unaccounted.length || keptNumber.length || unquoted.length) {
      // Core's words only: the yes's own prose argues the opposite of the verdict it now carries.
      return failed("does_not_answer", "model", codes.doesNotAnswer, refusedYesReason(unaccounted.length > 0, keptNumber.length > 0, unquoted.length > 0), observation, automationStudioResultRepairDirective({
        summary: input.summary,
        leftOutUnaccounted: unaccounted,
        leftOutKeptNumber: keptNumber,
        checked: [...unaccounted.map(unaccountedLine), ...unquoted.map(unquotedLine), ...keptNumber.map(keptNumberLine)]
      }));
    }
    // A yes citing a cell Core's record of the result does not hold is not a yes (`../cited-yes/`, t810): unsure, with Core's sentence for each citation it cannot find.
    if (citations?.refuted.length) {
      return {
        ...failed("unsure", "model", codes.yesCitationRefuted, `The result was judged to answer the request, but Core could not find ${citations.refuted.length === 1 ? "the cell the judgement cited" : `${citations.refuted.length} of the ${citations.cited} cells the judgement cited`} in the stored rows, so the result remains unconfirmed.`, observation),
        ...(Object.keys(answeredReading).length ? { answeredReading } : {}),
        ...yesCitations
      };
    }
    return {
      schemaVersion: "automation-studio.result-verification.v1",
      verdict,
      basis: "model",
      // A yes that also said the Flow needs a change is not a clean pass (header, t515).
      code: advised ? codes.answersWithChangeAdvised : codes.answers,
      reason: "The result was judged to answer the request.",
      observation,
      ...(Object.keys(answeredReading).length ? { answeredReading } : {}),
      ...yesCitations
    };
  }
  if (verdict === "does_not_answer") {
    return failed(verdict, "model", codes.doesNotAnswer, "The result was judged not to answer the request the Flow was built for.", observation, withDefects(automationStudioResultRepairDirective({
      summary: input.summary,
      judgement: {
        ...(input.diagnosis?.expected !== undefined ? { expected: input.diagnosis.expected } : {}),
        ...(input.diagnosis?.observed !== undefined ? { observed: input.diagnosis.observed } : {}),
        // `changed` is the field the diagnosis channel already asks a model to
        // fill with its reading, and the reply's summary stands in where it left
        // it empty. Neither is required and neither is asked for twice.
        ...(advice(input) !== undefined ? { advice: advice(input) } : {}),
        // Whether what was asked can still be had: the one field a build reads
        // to end "not doable" (t195-w37, live run `run-murwcaj0-40e56557`).
        ...(input.diagnosis?.stillAchievable !== undefined ? { stillAchievable: input.diagnosis.stillAchievable } : {})
      },
      // Each row the judgement names, checked against what the run holds (live run `run-muw60j7c-bb7c9a62`, C-5).
      checked: automationStudioResultCheckedRows(input.summary, replyText(input)),
      // Core's own finding beside the judgement's: the repair has the rows whoever saw them.
      leftOutKeptNumber: keptNumber
    }), input.diagnosis?.defects));
  }
  const silent = input.basis === "model_silent" || input.diagnosis?.answersRequest === undefined;
  if (silent) return failed(verdict, "model_silent", codes.silent, "The verification call answered without saying whether the result answers the request, so nothing confirmed it.", observation);
  // What it doubted, screened as a no's reading is: an unsure beside a yes is weighed by it against Core's record (`../agreement/`, t503).
  const doubt = automationStudioResultScreenedJudgement({ expected: input.diagnosis?.expected, observed: input.diagnosis?.observed, advice: advice(input) }).judgement;
  return { ...failed(verdict, "model", codes.unsure, "The verification call could not tell whether the result answers the request, so nothing confirmed it.", observation), ...(doubt ? { unsureReading: doubt } : {}) };
}

/**
 * A no's directive with the defects its reply listed on its reading
 * (`./defects.ts`, t752): what Core looks for in its own record before the no
 * counts (`../agreement/unsupported-no.ts`). Nothing where it listed none.
 */
function withDefects(repair: AutomationStudioResultRepairDirective, listed: unknown): AutomationStudioResultRepairDirective {
  const screened = automationStudioResultScreenedDefects(listed);
  const withheld = screened.withheld || repair.withheld === true;
  if (!screened.defects.length && listed === undefined) return withheld ? { ...repair, withheld: true } : repair;
  return { ...repair, judgement: { ...repair.judgement, defects: screened.defects }, ...(withheld ? { withheld: true } : {}) };
}
