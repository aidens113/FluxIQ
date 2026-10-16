import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import type { JudgeReading } from "./types.ts";

/** What a call that judged `does_not_answer` said, copied off its directive; nothing for any other call or an empty reading. */
export function unconfirmedReading(verification: AutomationStudioResultVerification): JudgeReading | undefined {
  if (verification.verdict !== "does_not_answer") return undefined;
  const judgement = verification.repair?.judgement;
  if (!judgement) return undefined;
  const reading: JudgeReading = {
    ...(judgement.expected ? { expected: judgement.expected } : {}),
    ...(judgement.observed ? { observed: judgement.observed } : {}),
    ...(judgement.advice ? { advice: judgement.advice } : {})
  };
  return Object.keys(reading).length ? reading : undefined;
}
