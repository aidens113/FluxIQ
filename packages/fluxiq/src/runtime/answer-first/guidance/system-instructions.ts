// The exploration's role in the system message, by the seam every agent role uses: its
// text on the request, kept by the domain's own decorator
// (`../../llm/domain-instructions/provider.ts`, as the project supervisor's is). Unlike the
// supervisor, this role operates the target, so the domain's operating text stays,
// after the role's: how a page reads, how to close a layer and how to page are this
// work's as much as a builder's.

import type { AutomationStudioLlmTaskDomainInstructions } from "../../llm/domain-instructions/index.ts";
import { automationStudioOverriddenText } from "../../run-overrides/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_VERSION } from "./guidance.ts";
import { automationStudioAnswerFirstOverriddenGuidance } from "./overridden-guidance.ts";

/** The role's instructions over a domain's own text, when it bound any. */
export function automationStudioAnswerFirstSystemInstructions(domain?: { version?: string | undefined; text?: string | undefined } | undefined): AutomationStudioLlmTaskDomainInstructions {
  // Read at each call, so it is the run's own overrides that apply: the role's paragraphs by their ids, and the domain's text (append-only) as `domain.instructions`.
  const guidance = automationStudioAnswerFirstOverriddenGuidance();
  const trimmed = domain?.text?.trim();
  const text = trimmed ? automationStudioOverriddenText("prompt", "domain.instructions", trimmed) : undefined;
  return {
    domainId: "fluxiq.answer-first",
    version: domain?.version ? `${AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_VERSION}+${domain.version}` : AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE_VERSION,
    text: text ? `${guidance}\n\n${text}` : guidance
  };
}
