import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivity } from "./emit.ts";
import { automationStudioActivityReasonText } from "./wording/index.ts";

/**
 * Says one step of FluxIQ's thinking as its own chat message: `title` is what
 * it does, in a person's words (also the status `label`), and `text` is why,
 * the model's own stated reason where there is one, held to `max` characters
 * (`wording/reason-text.ts`). Nothing is said when the text is empty: a
 * thought with no reason is only the action, which the tool rows already say.
 */
export function emitAutomationStudioActivityThought(input: {
  phase: ClientGatewayActivityPhase;
  title: string;
  text: unknown;
  status?: "started" | "succeeded" | "failed";
  ref?: string | undefined;
  max?: number;
}): void {
  const text = automationStudioActivityReasonText(input.text, input.max);
  if (!text) return;
  emitAutomationStudioActivity({
    phase: input.phase,
    label: input.title,
    detail: { kind: "thought", title: input.title, text, status: input.status ?? "succeeded", ...(input.ref ? { ref: input.ref } : {}) }
  });
}
