import type { AutomationStudioAnthropicModel } from "../../catalog/index.ts";

/**
 * Every call runs without thinking (user, 2026-11-19: "no more thinking mode"). Left
 * unset, each model thinks adaptively, and a live run spent 85-90% of every decision's
 * time on hidden thinking (run-mwo3dp11, 1,000-3,000 thinking tokens per call). Each
 * model turns it off its own way:
 * - Haiku 5.5: `disabled`, accepted at effort `high` or below (its default is `medium`).
 * - Sonnet 5.5: rejects `disabled`; `between_tools` turns thinking off, accepted at its
 *   default effort (`high`) with no other thinking field.
 * - Opus 5.5: thinking cannot be turned off (`disabled` is a 400 at every effort), so it
 *   runs at `low` effort, its least.
 */
export const AUTOMATION_STUDIO_ANTHROPIC_NO_THINKING: Readonly<Record<AutomationStudioAnthropicModel, { thinking?: { type: "disabled" | "between_tools" }; effort?: "low" }>> = {
  "claude-haiku-5-5": { thinking: { type: "disabled" } },
  "claude-sonnet-5-5": { thinking: { type: "between_tools" } },
  "claude-opus-5-5": { effort: "low" }
};
