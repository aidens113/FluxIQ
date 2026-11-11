// The port the attempt feeds the result through, and reads it back by: what the wiring (call-chain, flow-run, the
// draft port, the decision context) calls. It holds one ledger for one attempt and nothing else.
//
// `record` takes what one call or one run did, as events, and answers the line that call's answer carries: the change
// line where the result changed, a look's line where the call only looked, or `undefined`. A `take` of a call that is
// not a look takes nothing and is answered in words, so the model is never told a take happened that did not.
import { automationStudioAnswerFirstAnswerContractOf } from "./answer-contract.ts";
import { automationStudioAnswerFirstResultAnswer, type AutomationStudioAnswerFirstResultAnswer } from "./answer.ts";
import { automationStudioAnswerFirstResultChangeLine } from "./change-line.ts";
import { automationStudioAnswerFirstResultEmptyRefusal } from "./empty-refusal.ts";
import { automationStudioAnswerFirstResultHeader } from "./header.ts";
import { automationStudioAnswerFirstResultApply, automationStudioAnswerFirstResultLedger } from "./ledger.ts";
import { automationStudioAnswerFirstResultLookLine } from "./look-line.ts";
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import type { AutomationStudioAnswerFirstResultEvent, AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export type AutomationStudioAnswerFirstResultPort = {
  /** Feed what one call or run did; answers the line its answer carries, or `undefined`. */
  record(events: readonly AutomationStudioAnswerFirstResultEvent[]): string | undefined;
  /** The statement every model request carries (`./header.ts`). */
  header(): string;
  /** The output step, which the ending and the keep read back. */
  outputStep(): AutomationStudioAnswerFirstResultStep | undefined;
  /** The answer's rows under the contract (`./answer.ts`). */
  answer(): AutomationStudioAnswerFirstResultAnswer;
  /** The completion refusal for an empty result, or `undefined` when it holds rows (`./empty-refusal.ts`). */
  emptyRefusal(): string | undefined;
  /** The ledger as it stands, for the judge's summary. */
  ledger(): AutomationStudioAnswerFirstResultLedger;
};

/** A port over a new ledger for the request `instruction`, whose named columns are its answer contract. */
export function automationStudioAnswerFirstResultPort(instruction: string): AutomationStudioAnswerFirstResultPort {
  let ledger = automationStudioAnswerFirstResultLedger(automationStudioAnswerFirstAnswerContractOf(instruction));
  return {
    record(events) {
      const before = ledger;
      const refused: string[] = [];
      let looked: string | undefined;
      for (const event of events) {
        if (event.kind === "take" && !ledger.looks.some((look) => look.source === event.source)) refused.push(`call ${event.source} is not a read outside the draft, so nothing was taken`);
        if (event.kind === "look") looked = event.read.source;
        ledger = automationStudioAnswerFirstResultApply(ledger, event);
      }
      const said = automationStudioAnswerFirstResultChangeLine(before, ledger) ?? (looked === undefined ? undefined : automationStudioAnswerFirstResultLookLine(ledger, looked));
      const lines = [...refused.map((line) => `${line}.`), ...(said === undefined ? [] : [said])];
      return lines.length ? lines.join(" ") : undefined;
    },
    header: () => automationStudioAnswerFirstResultHeader(ledger),
    outputStep: () => automationStudioAnswerFirstResultOutputStep(ledger),
    answer: () => automationStudioAnswerFirstResultAnswer(ledger),
    emptyRefusal: () => automationStudioAnswerFirstResultEmptyRefusal(ledger),
    ledger: () => ledger,
  };
}
