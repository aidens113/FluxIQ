import type { ClientGatewayActivityPhase, ClientGatewayActivityProjectCard } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../../project-agents/contracts/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioProjectCardWords } from "./card-words.ts";
import { automationStudioProjectSubflowPurpose } from "./subflow-purpose.ts";

/** What the supervisor's plan card is made from. */
export type AutomationStudioProjectPlanCardInput = {
  taskSpec: AutomationStudioProjectTaskSpec;
  structurePlan: AutomationStudioProjectStructurePlan;
  /** The briefs already written for this plan: each one's starting case and allowance. */
  briefs?: readonly AutomationStudioProjectSubflowBrief[];
  /** The supervisor's own one-line purpose per subflow key, where it wrote one. */
  purposes?: Readonly<Record<string, string>>;
  /** What the supervisor keeps back for the judged whole run and one repair round. */
  reserveUsd?: number;
  phase?: ClientGatewayActivityPhase;
};

const TEXT = 160;

/**
 * Shows the supervisor's plan in the chat as one card (a `note` row): the
 * task's parts in the person's own words, each subflow with its one-line
 * purpose and the parts it carries, each brief's starting case and allowance,
 * and the reserve. Never a digest in the title, the ref or the card.
 */
export function emitAutomationStudioProjectPlanCard(input: AutomationStudioProjectPlanCardInput): void {
  const { taskSpec, structurePlan } = input;
  const briefs = input.briefs ?? [];
  const card: ClientGatewayActivityProjectCard = {
    kind: "plan",
    parts: taskSpec.parts.map((part) => ({ id: part.id, words: automationStudioProjectCardWords(part.quote.text, TEXT) })),
    subflows: structurePlan.plan.subflows.map((subflow) => ({
      key: subflow.key,
      name: automationStudioProjectCardWords(subflow.name, TEXT) || subflow.key,
      purpose: automationStudioProjectSubflowPurpose(subflow.key, structurePlan, taskSpec, input.purposes?.[subflow.key]),
      parts: [...(structurePlan.partOf[subflow.key] ?? [])]
    })),
    ...(briefs.length ? { cases: briefs.map((brief) => ({ subflowKey: brief.subflowKey, caseId: brief.entry.caseId })) } : {}),
    ...(briefs.length ? { budget: briefs.map((brief) => ({ subflowKey: brief.subflowKey, usd: brief.allowanceUsd })) } : {}),
    ...(input.reserveUsd === undefined ? {} : { reserveUsd: input.reserveUsd })
  };
  const partCount = taskSpec.parts.length;
  const subflowCount = structurePlan.plan.subflows.length;
  const title = `Plan: ${partCount} ${partCount === 1 ? "part" : "parts"} in ${subflowCount} ${subflowCount === 1 ? "subflow" : "subflows"}`;
  const text = automationStudioProjectCardWords(card.subflows.map((subflow) => `${subflow.name}: ${subflow.purpose}`).join(". "), 1_000);
  emitAutomationStudioActivity({
    phase: input.phase ?? "thinking",
    label: "Planning the Flow",
    detail: { kind: "note", title, status: "succeeded", ...(text ? { text } : {}), project: card }
  });
}
