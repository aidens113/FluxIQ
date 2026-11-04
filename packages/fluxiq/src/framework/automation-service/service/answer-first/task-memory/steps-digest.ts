// A short name for a list of steps: each step's position, action and input, and nothing else
// (not its iteration, call id or timings), so the same steps are the same Flow. Key order in an
// input does not matter.

import { createHash } from "node:crypto";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";

export function automationStudioAnswerFirstStepsDigest(steps: readonly Pick<AutomationStudioFlowDraftStep, "position" | "actionId" | "input">[]): string {
  const canonical = JSON.stringify(steps.map((step) => [step.position, step.actionId, sorted(step.input)]));
  return createHash("sha256").update(canonical).digest("hex");
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, each]) => each !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, each]) => [name, sorted(each)]));
  }
  return value;
}
