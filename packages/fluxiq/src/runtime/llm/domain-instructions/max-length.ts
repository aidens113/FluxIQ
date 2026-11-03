/**
 * The most a domain's system instructions may run to, in UTF-16 code units.
 *
 * They are sent with every request a domain's build makes, in the system
 * message every call repeats, so they are paid for on every call: a bound
 * that keeps them to a page of rules, not a second prompt.
 */
export const AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH = 4_000;
