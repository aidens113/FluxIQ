import type { AutomationStudioProjectStructurePlan, AutomationStudioProjectTaskSpec } from "../../project-agents/contracts/index.ts";
import { automationStudioProjectCardWords } from "./card-words.ts";

/** The longest purpose a card carries (`ClientGatewayActivityProjectCard`). */
const PURPOSE_MAX = 160;

/**
 * A subflow's one-line purpose for the chat: the supervisor's own line when it
 * wrote one, else the person's own words for the parts the plan gives the
 * subflow (each part's verbatim quote, joined), else the subflow's name. Never
 * a digest.
 */
export function automationStudioProjectSubflowPurpose(
  subflowKey: string,
  structurePlan: AutomationStudioProjectStructurePlan,
  taskSpec: AutomationStudioProjectTaskSpec,
  written?: string
): string {
  const own = written === undefined ? "" : automationStudioProjectCardWords(written, PURPOSE_MAX);
  if (own) return own;
  const carried = structurePlan.partOf[subflowKey] ?? [];
  const quotes = carried
    .map((partId) => taskSpec.parts.find((part) => part.id === partId)?.quote.text)
    .filter((quote): quote is string => typeof quote === "string" && quote.trim() !== "");
  const said = automationStudioProjectCardWords(quotes.join("; "), PURPOSE_MAX);
  if (said) return said;
  const name = structurePlan.plan.subflows.find((subflow) => subflow.key === subflowKey)?.name ?? subflowKey;
  return automationStudioProjectCardWords(name, PURPOSE_MAX) || subflowKey;
}
