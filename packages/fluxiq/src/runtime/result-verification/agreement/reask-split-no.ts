import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK } from "./split-no-words.ts";

/**
 * The one re-ask of a split's no (header, t725): where one call said yes and
 * the other no, and no call was asked again yet, the no is asked once more to
 * name a row wrongly kept or left out, or a wrong column or value, quoting the
 * request (`./split-no-words.ts`). Its answer takes its place under the
 * agreement's own rule (`agree`): a yes there beside the yes is two yeses, the
 * first no's concern carried as that yes's advice (`answeredReading.advice`),
 * never a repair; a no naming a defect stands, and the split with it. A re-ask
 * that did not come back usable leaves the split as it was. `ask` is the
 * verification's own, so the call is charged to the same purse. Never asked
 * twice: an outcome with a third verdict is returned unchanged.
 */
export async function automationStudioResultVerificationReaskSplitNo(input: {
  settled: AutomationStudioResultVerification;
  first: AutomationStudioResultVerification;
  second?: AutomationStudioResultVerification | undefined;
  ask: (recheck: string, call: 1 | 2) => Promise<AutomationStudioResultVerification>;
  agree: (first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) => AutomationStudioResultVerification;
}): Promise<AutomationStudioResultVerification> {
  const { settled, first, second } = input;
  if (!second || settled.basis !== "model_disagreed" || (settled.verdicts?.length ?? 0) !== 2) return settled;
  const call = splitNoCall(first, second);
  if (!call) return settled;
  const no = call === 1 ? first : second;
  const reasked = await input.ask(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK, call);
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? []), reasked.verdict];
  if (reasked.basis !== "model") return { ...settled, verdicts, calls: 3 };
  const again = input.agree(call === 1 ? reasked : first, call === 2 ? reasked : second);
  const concern = again.verdict === "answers" ? concernOf(no) : undefined;
  return { ...again, verdicts, calls: 3, ...(concern ? { answeredReading: { ...again.answeredReading, advice: concern } } : {}) };
}

/** The call of a split that said no with a reading of its own, beside a model's yes; none otherwise. A yes Core refused carries no reading. */
function splitNoCall(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification): 1 | 2 | undefined {
  if (ownNo(first) && modelYes(second)) return 1;
  if (modelYes(first) && ownNo(second)) return 2;
  return undefined;
}

function ownNo(verification: AutomationStudioResultVerification): boolean {
  return verification.basis === "model" && verification.verdict === "does_not_answer" && verification.repair?.judgement !== undefined;
}

function modelYes(verification: AutomationStudioResultVerification): boolean {
  return verification.basis === "model" && verification.verdict === "answers";
}

/** What the first no was concerned about, as screened for its reading: its advice, else what it observed. */
function concernOf(no: AutomationStudioResultVerification): string | undefined {
  const judgement = no.repair?.judgement;
  return judgement?.advice ?? judgement?.observed;
}
