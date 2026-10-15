import type { ClientGatewayActivityPhase, ClientGatewayActivityProjectCard } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief } from "../../project-agents/contracts/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioProjectCardWords } from "./card-words.ts";
import { automationStudioProjectReturnWords } from "./return-words.ts";
import { automationStudioProjectSubflowName } from "./subflow-name.ts";

/** What a builder's return card is made from. */
export type AutomationStudioProjectReturnCardInput = {
  returned: AutomationStudioProjectBuilderReturn;
  /** The brief the return answers: it names the subflow, which a return without a proposal does not. */
  brief: AutomationStudioProjectSubflowBrief;
  structurePlan?: AutomationStudioProjectStructurePlan;
  phase?: ClientGatewayActivityPhase;
};

const OUTCOME_WORDS = Object.freeze({ done: "done", partial: "partly done", blocked: "blocked" } satisfies Record<AutomationStudioProjectBuilderReturn["outcome"], string>);
const STATUS = Object.freeze({ done: "succeeded", partial: undefined, blocked: "failed" } satisfies Record<AutomationStudioProjectBuilderReturn["outcome"], "succeeded" | "failed" | undefined>);

/** A run of hex as long as a digest's: a brief id shaped like one is never a row's ref. */
const DIGEST_LIKE = /[a-f0-9]{32,}/iu;

/**
 * Shows a builder's return in the chat as a `note` row: "<subflow>: done"
 * (partly done, blocked) with the builder's reason in a person's words
 * (`./return-words.ts`), and a card of its outcome, spend, calls and how
 * many trials it ran. The proposal's digest and the
 * trials' digests stay in the build record; the card counts trials only.
 */
export function emitAutomationStudioProjectReturnCard(input: AutomationStudioProjectReturnCardInput): void {
  const { returned, brief } = input;
  const subflowName = automationStudioProjectSubflowName(brief.subflowKey, input.structurePlan);
  // The reason is written for the supervisor; the person reads it in words, never its codes or ids (`./return-words.ts`, t649).
  const reason = automationStudioProjectCardWords(automationStudioProjectReturnWords(returned, (key) => automationStudioProjectSubflowName(key, input.structurePlan)), 240);
  const card: ClientGatewayActivityProjectCard = {
    kind: "return",
    briefId: returned.briefId,
    subflowKey: brief.subflowKey,
    outcome: returned.outcome,
    reason,
    spentUsd: returned.spentUsd,
    calls: returned.calls,
    trials: returned.trials.length
  };
  const title = automationStudioProjectCardWords(`${subflowName}: ${OUTCOME_WORDS[returned.outcome]}`, 160);
  const status = STATUS[returned.outcome];
  emitAutomationStudioActivity({
    phase: input.phase ?? "building",
    label: title,
    detail: {
      kind: "note",
      title,
      ...(reason ? { text: reason } : {}),
      ...(status === undefined ? {} : { status }),
      ...(DIGEST_LIKE.test(returned.briefId) ? {} : { ref: returned.briefId }),
      project: card
    }
  });
}
