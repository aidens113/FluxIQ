import type { ClientGatewayActivityPhase, ClientGatewayActivityProjectCard } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioProjectReceiptRef } from "../../project-agents/contracts/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioProjectCardWords } from "./card-words.ts";

type Verdict = Extract<ClientGatewayActivityProjectCard, { kind: "receipt" }>["verdict"];

/** What a trial receipt's card is made from. */
export type AutomationStudioProjectReceiptCardInput = {
  receipt: AutomationStudioProjectReceiptRef;
  /** What the trial's judge answered; a trial that could not be judged is `unconfirmed`. */
  verdict: Verdict;
  /** The brief whose trial it was; absent for the supervisor's judged whole run. */
  briefId?: string;
  /** The subflow a partial trial ran, for the title. */
  subflowName?: string;
  phase?: ClientGatewayActivityPhase;
};

const TRIALS = Object.freeze({ subflow_trial: "Subflow trial", candidate_trial: "Whole-Flow trial" } satisfies Record<AutomationStudioProjectReceiptRef["kind"], string>);
const VERDICT_WORDS = Object.freeze({ passed: "passed", failed: "failed", unconfirmed: "could not be confirmed" } satisfies Record<Verdict, string>);
const STATUS = Object.freeze({ passed: "succeeded", failed: "failed", unconfirmed: "failed" } satisfies Record<Verdict, "succeeded" | "failed">);

/** A run of hex as long as a digest's: a brief id shaped like one is never a row's ref. */
const DIGEST_LIKE = /[a-f0-9]{32,}/iu;

/**
 * Shows a trial receipt in the chat as a `note` row: "Subflow trial passed:
 * <subflow>" or "Whole-Flow trial failed", with a card naming the receipt and
 * its verdict. A subflow trial is a partial receipt -- evidence for the
 * builder and the supervisor, never credit toward promotion -- and the card
 * says which it was. The receipt's digest is never shown.
 */
export function emitAutomationStudioProjectReceiptCard(input: AutomationStudioProjectReceiptCardInput): void {
  const { receipt, verdict } = input;
  const card: ClientGatewayActivityProjectCard = {
    kind: "receipt",
    ...(input.briefId === undefined ? {} : { briefId: input.briefId }),
    receipt: receipt.kind,
    receiptId: receipt.receiptId,
    verdict
  };
  const subject = input.subflowName === undefined ? "" : automationStudioProjectCardWords(input.subflowName, 160);
  const title = automationStudioProjectCardWords(`${TRIALS[receipt.kind]} ${VERDICT_WORDS[verdict]}${subject ? `: ${subject}` : ""}`, 160);
  emitAutomationStudioActivity({
    phase: input.phase ?? "verifying",
    label: title,
    detail: {
      kind: "note",
      title,
      status: STATUS[verdict],
      ...(input.briefId === undefined || DIGEST_LIKE.test(input.briefId) ? {} : { ref: input.briefId }),
      project: card
    }
  });
}
