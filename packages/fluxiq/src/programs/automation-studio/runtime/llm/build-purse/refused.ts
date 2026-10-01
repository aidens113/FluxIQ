import type { AutomationStudioLlmBuildPurseRefusal } from "./purse.ts";

/**
 * A call the build's purse would not pay for, so it was never sent. Thrown by
 * `./run.ts` in place of whatever the wrapped call returned or threw, so the
 * loop reads one thing -- the money ran out -- rather than the harness failure
 * a caller built from the refusal.
 */
export class AutomationStudioLlmBuildPurseRefused extends Error {
  constructor(readonly refusal: AutomationStudioLlmBuildPurseRefusal) {
    super("The build's spending limit cannot pay for its next call, so it was not sent.");
    this.name = "AutomationStudioLlmBuildPurseRefused";
  }
}
