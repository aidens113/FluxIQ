import type { AutomationStudioLlmTaskDomainInstructions } from "../../llm/domain-instructions/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";

/** Names the supervisor's text, so a step log or a cached prefix that changed traces to the edit (as a domain's `version` does). */
const VERSION = "project-supervisor.1";

/**
 * What the project supervisor is told in the system message, in place of the
 * bound domain's own instructions (t569): its role and the kind of host the
 * build runs on, after Core's rules and before Core's task prose, as a
 * domain's text is placed (`../../llm/deepseek/system-prompt.ts`).
 *
 * **Why.** The first live `project` builds sent the supervisor the web
 * domain's operating text -- "You operate a real website ... use the site's
 * own search (type into its field[search] and submit)" -- which is a builder's
 * work and undid the guidance that it plans and never operates the target
 * (`run-mv7t07hx-fe96a174`, every decision's system message). Builders keep
 * the domain's text unchanged: they are the ones who operate it.
 */
export function automationStudioProjectSupervisorSystemInstructions(domainId: string): AutomationStudioLlmTaskDomainInstructions {
  return {
    domainId: "fluxiq.project-supervisor",
    version: VERSION,
    text: `${GUIDANCE.system.role}\n\n${GUIDANCE.system.host.replace("{domainId}", domainId.trim() || "unnamed")}`
  };
}
