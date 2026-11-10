import type { AssistantConsequence } from "@fluxiq/contracts/program-api-inputs";

/**
 * The classes that run unasked only when the person's own words clearly ask
 * (U5): sending, moving money, deleting, keys and access, and spending past
 * what is left of the message's allowance (`budget`). `read` and `change` run
 * at once.
 */
export type PanelAssistantGatedClass = "send" | "money" | "delete" | "security" | "budget";

const GATED: ReadonlySet<AssistantConsequence> = new Set(["send", "money", "delete", "security"]);

/** The gated classes of a call: its own gated consequences, and `budget` when its projected spend is over what is left. */
export function panelAssistantGatedClasses(consequences: readonly AssistantConsequence[], overBudget: boolean): PanelAssistantGatedClass[] {
  const gated: PanelAssistantGatedClass[] = consequences.filter((consequence): consequence is Exclude<AssistantConsequence, "read" | "change"> => GATED.has(consequence));
  if (overBudget) gated.push("budget");
  return [...new Set(gated)];
}
