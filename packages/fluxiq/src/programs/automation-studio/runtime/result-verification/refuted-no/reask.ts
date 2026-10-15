// The one re-ask of a no Core's record wholly refutes, and what it comes to
// (t607, `./weigh.ts`).
//
// Each call the agreement marked (`refutedNo`) is asked once more, its copy
// carrying Core's findings (`./recheck-words.ts`), and its answer takes its
// place. Then:
//
// - a re-ask that answered no and that Core's record still wholly refutes, or
//   one that did not come back usable, is not taken as a no: that call counts
//   for nothing, and the outcome is unsure (`refutationContradicted`) -- with
//   a yes beside it, the two disagreed; otherwise, unconfirmed. It never fails
//   the run (`automationStudioResultVerificationFailsRun`), and it is never a
//   yes: a yes comes only from the calls themselves.
// - otherwise the answers are weighed by the agreement rule as any two are: two
//   yeses are a yes, a yes and a no that stands are a split, two nos that stand
//   refute.
//
// Never asked twice: the outcome is marked `reasked`.

import type { AutomationStudioResultRepairDirective, AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict.ts";
import { automationStudioResultRefutedNoRecheckWords } from "./recheck-words.ts";
import type { AutomationStudioResultNoRecord } from "./types.ts";
import { automationStudioResultRefutedReading } from "./weigh.ts";

type Verification = AutomationStudioResultVerification;
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

/** The re-ask of each refuted no `settled` marks, and the outcome it comes to (header); `settled` unchanged where nothing is marked or it was asked already. */
export async function automationStudioResultReaskRefutedNo(input: {
  first: Verification;
  second: Verification;
  settled: Verification;
  record: AutomationStudioResultNoRecord;
  /** Asks call `call` once more, its copy carrying `recheck`. */
  ask: (recheck: string, call: 1 | 2) => Promise<Verification>;
  /** The agreement rule over two answers, as `../agreement.ts` weighs them. */
  agree: (first: Verification, second: Verification) => Verification;
}): Promise<Verification> {
  const marked = input.settled.refutedNo;
  if (!marked || marked.reasked) return input.settled;
  const calls: Verification[] = [input.first, input.second];
  const asked: AutomationStudioResultVerdict[] = [];
  const notTaken = new Set<1 | 2>();
  const refutedReadings: Array<{ call: 1 | 2; reading: Reading; findings: string[] }> = [];
  for (const call of marked.calls) {
    const before = calls[call - 1]!;
    const findings = automationStudioResultRefutedReading(before.repair?.judgement, input.record).findings;
    const again = await input.ask(automationStudioResultRefutedNoRecheckWords(findings.length ? findings : marked.findings), call);
    asked.push(again.verdict);
    const weighed = again.basis === "model" && again.verdict === "does_not_answer" ? automationStudioResultRefutedReading(again.repair?.judgement, input.record) : undefined;
    if (again.basis !== "model" || weighed?.wholly) {
      notTaken.add(call);
      const reading = (weighed ? again : before).repair?.judgement;
      if (reading) refutedReadings.push({ call, reading, findings: weighed?.findings.length ? weighed.findings : findings });
    }
    calls[call - 1] = again;
  }
  const verdicts = [...(input.settled.verdicts ?? []), ...asked];
  const total = 2 + asked.length;
  const done = { ...marked, reasked: true as const };
  if (!notTaken.size) return { ...input.agree(calls[0]!, calls[1]!), verdicts, calls: total, refutedNo: done };
  const others = ([1, 2] as const).filter((call) => !notTaken.has(call)).map((call) => calls[call - 1]!);
  const yes = others.find((other) => other.verdict === "answers");
  const standing = others.find((other) => other.verdict === "does_not_answer" && other.repair?.judgement);
  const basis = yes ? "model_disagreed" as const : "model_unconfirmed" as const;
  const reading = standing?.repair?.judgement ?? labelled(refutedReadings);
  const answered = yes?.answeredReading;
  return {
    schemaVersion: input.first.schemaVersion,
    verdict: "unsure",
    basis,
    code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationContradicted,
    reason: `This result was checked with the same evidence, and every reason ${notTaken.size === 2 ? "both checks" : "a check"} gave for answering that it does not do what was asked is contradicted by Core's own record of this run: ${marked.findings.join(" ")} Asked once more with that record named, ${notTaken.size === 2 ? "neither" : "it"} gave a reason the record leaves standing, so ${notTaken.size === 2 ? "neither no is" : "that no is not"} taken. ${UNSETTLED[basis].run}`,
    observation: input.first.observation,
    verdicts,
    calls: total,
    refutedNo: done,
    ...(reading ? { unconfirmedReading: reading } : {}),
    ...(answered ? { answeredReading: { ...answered } } : {})
  };
}

/** The refuted readings, each field labelled with its call and Core's finding, as `../agreement.ts` labels a contradicted reading (t501). */
function labelled(readings: ReadonlyArray<{ call: 1 | 2; reading: Reading; findings: string[] }>): Reading | undefined {
  if (!readings.length) return undefined;
  const field = (name: "expected" | "observed" | "advice"): string | undefined => {
    const parts = readings.filter((one) => one.reading[name]).map((one) => `Judge call ${one.call} (contradicted by Core's record: ${one.findings.join(" ")}): ${one.reading[name]}`);
    return parts.length ? parts.join(" ") : undefined;
  };
  const expected = readings.find((one) => one.reading.expected)?.reading.expected;
  const observed = field("observed");
  const advice = field("advice");
  return { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}), ...(advice ? { advice } : {}) };
}
