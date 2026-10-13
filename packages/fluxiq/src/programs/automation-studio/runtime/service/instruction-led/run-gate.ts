import type { AutomationStudioRunControlGate } from "../../run-control/index.ts";

/** Registry release cannot bypass current durable instruction authority before resumed execution. */
export function instructionBoundRunGate(gate: AutomationStudioRunControlGate, verify: () => Promise<unknown>): AutomationStudioRunControlGate {
  return { checkpoint: at => {
    const paused = gate.checkpoint(at);
    return paused ? paused.then(async outcome => {
      if (outcome.outcome === "resume") await verify();
      return outcome;
    }) : null;
  }, ...(gate.heldBy ? { heldBy: () => gate.heldBy!() } : {}) };
}
