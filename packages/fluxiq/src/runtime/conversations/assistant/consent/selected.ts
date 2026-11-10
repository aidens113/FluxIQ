import type { PanelContextKey } from "@fluxiq/contracts/program-api-inputs";
import type { PanelAssistantContext, PanelAssistantTargetItem } from "../types.ts";

/** Selection keys from the innermost thing selected outwards: a bare "this" means the first one present. */
const SELECTION_LEVELS: ReadonlyArray<readonly PanelContextKey[]> = [["nodeIds", "stepNumbers"], ["datasetId"], ["runId"], ["keyId"], ["flowId"], ["projectId"], ["folder"]];

/**
 * Whether "this" (or "these", "selected") points at `item`: it is selected on
 * the panel, and it is either of the kind the words named ("this project") or,
 * with no kind said, the innermost thing selected. A bare "this" on a Flow
 * never means the project around it.
 */
export function panelAssistantSelected(item: PanelAssistantTargetItem, context: PanelAssistantContext, kindSaid?: string): boolean {
  const key = item.contextKey;
  if (key === undefined || key === "page") return false;
  const selected = context[key];
  const isSelected = Array.isArray(selected) ? selected.map(String).includes(item.id) : selected !== undefined && String(selected) === item.id;
  if (!isSelected) return false;
  if (kindSaid !== undefined) return kindSaid === item.kind.toLowerCase() || kindSaid === `${item.kind.toLowerCase()}s`;
  const innermost = SELECTION_LEVELS.find((keys) => keys.some((candidate) => context[candidate] !== undefined));
  return innermost !== undefined && innermost.includes(key);
}
