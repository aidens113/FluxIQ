import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import { automationStudioResultReaskRefutedNo } from "../refuted-no/index.ts";
import { automationStudioResultDoubtRecheckWords } from "../unsure-doubts/index.ts";
import { automationStudioResultKeptRowsFlagged } from "../verdict/index.ts";
import { agree } from "./agree.ts";
import { exclusionRecheckWords } from "./exclusion-words.ts";
import { noRecordOf } from "./no-record.ts";
import { recorded } from "./standing-record.ts";
import type { ReaskContradictedInput } from "./types.ts";
import { unstatedExclusion } from "./unstated-exclusion.ts";
import { automationStudioResultVerificationAgreement } from "./verification-agreement.ts";

/**
 * The one re-ask of an unsure call whose doubt Core's record contradicts
 * (header, t503). `settled` is what the two calls came to; when it marks a
 * contradicted unsure not yet asked again, `ask` asks that same call once more,
 * with `recheck` -- Core's words naming the record -- on the copy it is shown,
 * and its answer takes that call's place under the same rule. A re-ask that
 * did not come back usable leaves `settled` as it was. Never asked twice: the
 * outcome is marked `reasked`, and a marked one is returned unchanged.
 */
export async function automationStudioResultVerificationReaskContradicted(input: ReaskContradictedInput): Promise<AutomationStudioResultVerification> {
  // Every outcome a re-ask comes to keeps Core's record of the trial, as the agreement's own does (header, t652).
  return recorded(input, await reaskContradicted(input));
}

/** The re-ask itself (`automationStudioResultVerificationReaskContradicted`). */
async function reaskContradicted(input: ReaskContradictedInput): Promise<AutomationStudioResultVerification> {
  const { settled, second } = input;
  if (!second) return settled;
  const marked = settled.contradictedUnsure;
  if (!marked) {
    // A no whose every reason Core's record refutes, asked once more with Core's findings (t607, `../refuted-no/reask.ts`).
    const record = noRecordOf(input);
    if (settled.refutedNo && !settled.refutedNo.reasked && record) {
      return automationStudioResultReaskRefutedNo({ first: input.first, second, settled, record, kept: automationStudioResultKeptRowsFlagged(input.summary, input.wording), ask: input.ask, agree: (one, two) => agree({ ...input, first: one, second: two }) });
    }
    return reaskUnstatedExclusion(input, settled, second);
  }
  if (marked.reasked) return settled;
  const reasked = await input.ask(automationStudioResultDoubtRecheckWords(marked.about, marked.record), marked.call);
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? []), reasked.verdict];
  const done = { ...marked, reasked: true as const };
  if (reasked.basis !== "model") return { ...settled, verdicts, calls: 3, contradictedUnsure: done };
  const first = marked.call === 1 ? reasked : input.first;
  const other = marked.call === 2 ? reasked : second;
  const again = automationStudioResultVerificationAgreement({ ...input, first, second: other });
  const outcome = { ...again, verdicts, calls: 3, contradictedUnsure: done };
  // The doubt asked again said yes beside a no Core's record wholly refutes: that no is asked once more too (header, t628).
  const record = noRecordOf(input);
  if (reasked.verdict !== "answers" || !again.refutedNo || again.refutedNo.reasked || !record) return outcome;
  const chained = await automationStudioResultReaskRefutedNo({ first, second: other, settled: outcome, record, kept: automationStudioResultKeptRowsFlagged(input.summary, input.wording), ask: input.ask, agree: (one, two) => agree({ ...input, first: one, second: two }) });
  // Every call asked, the two, the doubt's re-ask and the no's: the refuted re-ask counts from two.
  const calls = chained.verdicts?.length ?? chained.calls;
  return { ...chained, ...(calls !== undefined ? { calls } : {}), contradictedUnsure: done };
}

/**
 * The one re-ask of a split's no whose advice adds an exclusion the request
 * never states (header, t515): that call is asked once more with the
 * exclusion named, and its answer takes its place under the same rule. A
 * re-ask that did not come back usable leaves `settled` as it was. Nothing is
 * asked without the request's wording, or where the no's exclusions are stated.
 */
async function reaskUnstatedExclusion(
  input: ReaskContradictedInput,
  settled: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification
): Promise<AutomationStudioResultVerification> {
  const unstated = settled.basis === "model_disagreed" ? unstatedExclusion(input.first, second, input.wording, noRecordOf(input)) : undefined;
  if (!unstated) return settled;
  const reasked = await input.ask(exclusionRecheckWords(unstated.exclusions), unstated.call);
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? []), reasked.verdict];
  if (reasked.basis !== "model") return { ...settled, verdicts, calls: 3 };
  const again = agree({ ...input, first: unstated.call === 1 ? reasked : input.first, second: unstated.call === 2 ? reasked : second }, unstated.call);
  return { ...again, verdicts, calls: 3 };
}
