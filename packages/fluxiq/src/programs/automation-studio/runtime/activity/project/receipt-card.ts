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

/**
 * Each receipt's verdict, short and in plain words: the overlay cut "Whole-Flow
 * trial could not be confir…" (t753, round 5), and "trial" and "subflow" are
 * no person's words.
 */
const VERDICT_WORDS = Object.freeze({
  candidate_trial: { passed: "The whole Flow's test passed", failed: "The whole Flow's test failed", unconfirmed: "Couldn't confirm the whole Flow's test" },
  subflow_trial: { passed: "One part's test passed", failed: "One part's test failed", unconfirmed: "Couldn't confirm one part's test" }
} satisfies Record<AutomationStudioProjectReceiptRef["kind"], Record<Verdict, string>>);
const STATUS = Object.freeze({ passed: "succeeded", failed: "failed", unconfirmed: "failed" } satisfies Record<Verdict, "succeeded" | "failed">);

/** A run of hex as long as a digest's: a brief id shaped like one is never a row's ref. */
const DIGEST_LIKE = /[a-f0-9]{32,}/iu;

/**
 * Shows a trial receipt in the chat as a `note` row: "One part's test passed:
 * <subflow>" or "The whole Flow's test failed", with a card naming the receipt and
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
  const title = automationStudioProjectCardWords(`${VERDICT_WORDS[receipt.kind][verdict]}${subject ? `: ${subject}` : ""}`, 160);
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
