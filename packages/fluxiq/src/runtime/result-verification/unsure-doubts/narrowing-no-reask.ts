// The one re-ask of a no that blames a step choosing the request's own words
// (t666, `./narrowing.ts`, `automationStudioResultNarrowingNoBlamed`).
//
// **Why.** A8 frozen pair 8 candidate towels `run-mvam0lys-2d3eb090`, 0064: a
// no blamed a step that chose, in a named group, an option the request names
// in its own words. Core could not refute it -- it never saw the rows the step
// removed -- so the reading reached the builder unweighed, the builder dropped
// the step, and nothing in the Flow read that part of the request again.
//
// **What is asked, and only that.** Core refutes nothing: it measured the step's
// choice and the page's counts, never the rows it removed. Where every no that
// keeps the verdict from two yeses blames only such steps -- a split's one no
// beside a yes, or both nos of a double no -- each is asked once more with
// Core's words on each step it blames, and its answer takes its place under the
// agreement's own rule (`agree`): a yes still needs two yeses. A double no where
// one no names anything else is left as it is, as t501 leaves a refuted no
// beside a no that stands: re-asking one could not make two yeses. Nothing is
// asked where the outcome already asked a call again (a contradicted unsure, a
// refuted no, an unstated exclusion), so no call is asked twice, and a re-ask
// that did not come back usable leaves its call's answer as it was.
//
// **Only where such steps are every reason it gives (t686).** A8 cost round
// `run-mvblov2i-abb7d82e`: a correct no that also called a step harmless was
// asked again here, and the yes took its place. The header above promised
// "only such steps"; the code checked only that each step it found was one.
// Now a no is asked again only where every reason it states is such a blame or
// refuted by Core's record (`../agreement/no-reasons.ts`, through
// `./narrowing.ts`), and the recheck says what a site filter's option words
// cannot show.
//
// The caller is the verification that asks the calls (`../verify.ts`), after
// the agreement's own re-asks (`../agreement/`,
// `automationStudioResultVerificationReaskContradicted`). Generic words, naming
// no site or task.

import type { AutomationStudioResultReadAccount, AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import type { AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioResultNarrowingNoBlamed } from "./narrowing.ts";

/**
 * The outcome after the one re-ask of each no that blames only steps choosing
 * the request's own words (header); `settled` as it was where none is asked.
 * `ask` asks call `call` once more, its copy carrying `recheck`; `agree` is the
 * agreement of two calls' answers.
 */
export async function automationStudioResultReaskNarrowingNo(input: {
  settled: AutomationStudioResultVerification;
  first: AutomationStudioResultVerification;
  second?: AutomationStudioResultVerification | undefined;
  reads?: readonly AutomationStudioResultReadAccount[] | undefined;
  requestText?: string | undefined;
  says?: ((text: string) => boolean) | undefined;
  /** Core's record of the judged result (`../refuted-no/`): the rows it holds, and what refutes a no's other reasons (t686). Absent, a reason is settled only as such a blame. */
  record?: AutomationStudioResultNoRecord | undefined;
  ask: (recheck: string, call: 1 | 2) => Promise<AutomationStudioResultVerification>;
  agree: (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) => AutomationStudioResultVerification;
}): Promise<AutomationStudioResultVerification> {
  const { settled, first, second } = input;
  if (!second || (settled.verdicts?.length ?? 0) !== 2 || settled.verdict === "answers") return settled;
  const blamed = ([1, 2] as const).map((call) => ({ call, said: blamedBy(call === 1 ? first : second, input) }));
  const nos = blamed.filter(({ call }) => isNo(call === 1 ? first : second));
  const others = [first, second].filter((verification) => !isNo(verification));
  // Only where every no blames such steps, beside a yes or another such no, can a re-ask make two yeses (header).
  if (!nos.length || nos.some(({ said }) => said === undefined) || others.some((verification) => verification.verdict !== "answers" || verification.basis !== "model")) return settled;
  const answers: [AutomationStudioResultVerification, AutomationStudioResultVerification] = [first, second];
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? [])];
  for (const { call, said } of nos) {
    const reasked = await input.ask(recheckWords(said!), call);
    verdicts.push(reasked.verdict);
    if (reasked.basis === "model") answers[call - 1] = reasked;
  }
  const again = input.agree(answers[0], answers[1]);
  return { ...again, verdicts, calls: verdicts.length };
}

/** Core's words on the steps a model's no blames, where such blames are every reason it gives (`./narrowing.ts`, t686); nothing otherwise. */
function blamedBy(verification: AutomationStudioResultVerification, input: { reads?: readonly AutomationStudioResultReadAccount[] | undefined; requestText?: string | undefined; says?: ((text: string) => boolean) | undefined; record?: AutomationStudioResultNoRecord | undefined }): string | undefined {
  if (!isNo(verification)) return undefined;
  return automationStudioResultNarrowingNoBlamed(verification.repair?.judgement, input.reads, input.requestText, input.says, input.record);
}

function isNo(verification: AutomationStudioResultVerification): boolean {
  return verification.basis === "model" && verification.verdict === "does_not_answer";
}

/** What the no asked again is told (header): what it blamed, Core's record of those steps, and what that record does not settle. */
function recheckWords(record: string): string {
  return "This same evidence was judged before, and that answer said the result does not answer the request because of a step that acted on the page before the read. "
    + `Core's own record of that step and the request's own words: ${record} `
    + "Core did not see the rows such a step removed, so its record settles nothing about them. "
    + "A site filter's option words do not show that each kept row meets the words of the request; a row's own text does. "
    + "Answer again from the evidence; answer no over such a step only where you quote the evidence or the words of the request that the option it chose fails.";
}
