// Which of an obstruction's ways out Core may press itself (P6, CC7, t799):
// the `clear_interference` rung offers itself on it (`../recovery-ladder.ts`)
// and presses it (`../ladder-run.ts`).

import type { AutomationStudioObstruction, AutomationStudioObstructionIntent, AutomationStudioObstructionWayOut } from "./obstruction.ts";

/** A way out Core can run: it names the definition that presses it. */
type PressableWayOut = AutomationStudioObstructionWayOut & { definitionId: string };

/** The intents Core presses, in the order it prefers them; `accept` is never one. */
const PRESSED_INTENTS: readonly AutomationStudioObstructionIntent[] = ["dismiss", "neutral"];

/**
 * The first way out that closes the layer (`dismiss`), else the first that
 * neither closes nor accepts (`neutral`), that Core can run: it names the node
 * definition that presses it, and a target for it unless it is the browser's
 * own `back`. A way out that accepts what the layer asks is never chosen,
 * whatever else is on offer. Nothing when no obstruction was reported or none
 * of its ways out qualifies.
 */
export function automationStudioObstructionWayOut(obstruction: AutomationStudioObstruction | undefined): PressableWayOut | undefined {
  if (!obstruction) return undefined;
  for (const intent of PRESSED_INTENTS) {
    for (const wayOut of obstruction.dismiss) {
      if (wayOut.intent !== intent || wayOut.definitionId === undefined) continue;
      if (wayOut.action === "back" || wayOut.controlRef !== undefined) return { ...wayOut, definitionId: wayOut.definitionId };
    }
  }
  return undefined;
}
