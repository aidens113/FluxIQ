import { automationStudioOverriddenText } from "../../run-overrides/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_PARAGRAPHS } from "./guidance.ts";

/**
 * The role's guidance as the current run's overrides read it: each paragraph by its own section id,
 * joined as `AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE` is, so with no overrides the text is that text.
 */
export function automationStudioAnswerFirstOverriddenGuidance(): string {
  return AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_PARAGRAPHS.map((paragraph) => automationStudioOverriddenText("prompt", paragraph.id, paragraph.text)).join("\n\n");
}
