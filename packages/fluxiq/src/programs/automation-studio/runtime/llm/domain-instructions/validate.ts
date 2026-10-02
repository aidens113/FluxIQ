import { AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH } from "./max-length.ts";
import type { AutomationStudioLlmDomainSystemInstructions } from "./system-instructions.ts";

const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
// Every control character but a line feed. A tab, a carriage return or an
// escape sequence in a system message is either a copying accident or an
// attempt to hide text from whoever reads the step log, and neither is a rule.
const CONTROL_CHARACTER = /(?!\n)\p{Cc}/u;

/**
 * A domain's system instructions, checked, or a thrown Error saying what is
 * wrong with them.
 *
 * Run where the runtime is bound, so a bad text stops the host when it binds
 * rather than failing a build halfway through it. The value comes back as a
 * fresh object of exactly the two fields, so nothing else a host attached
 * rides along into a request.
 */
export function assertAutomationStudioLlmDomainSystemInstructions(value: unknown, domainId: string): AutomationStudioLlmDomainSystemInstructions {
  const prefix = `Automation Studio domain "${domainId}" system instructions`;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${prefix} must be an object with a version and a text.`);
  const { version, text } = value as { version?: unknown; text?: unknown };
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(`${prefix}: version must match ${VERSION_PATTERN.source} (lower-case letters, digits, ".", "_" or "-", at most 64 characters).`);
  }
  if (typeof text !== "string" || !text.trim()) throw new Error(`${prefix} ${version}: text must not be empty.`);
  if (text.length > AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH) {
    throw new Error(`${prefix} ${version}: text is ${text.length} characters, over the ${AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH}-character limit.`);
  }
  if (CONTROL_CHARACTER.test(text)) throw new Error(`${prefix} ${version}: text contains a control character; only a line feed is allowed.`);
  return { version, text };
}
