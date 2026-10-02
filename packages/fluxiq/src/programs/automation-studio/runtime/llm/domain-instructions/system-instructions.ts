/**
 * What a bound domain asks Core to tell the model on every request made for
 * that domain's work, in the domain's own words (`../harness-options/binding.ts`).
 *
 * `version` names the text, so a step log or a cached prefix that changed can
 * be traced to the edit that changed it; `text` is the instructions
 * themselves. Both are checked when the runtime is bound (`./validate.ts`),
 * never mid-build.
 */
export type AutomationStudioLlmDomainSystemInstructions = {
  version: string;
  text: string;
};
