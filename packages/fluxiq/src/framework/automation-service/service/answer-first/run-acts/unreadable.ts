// A Flow's act record that could not be read refuses one run (`./store.ts`).

/** The record could not be read, so a run was refused rather than risk repeating what it holds. */
export class AutomationStudioAnswerFirstRunActsUnreadable extends Error {
  constructor(flowId: string, cause?: unknown) {
    super(`This Flow's record of what was already done could not be read, so this run did not start, in case it repeated a lasting act. Check the site, then run the Flow again to go ahead (Flow ${flowId}).`, cause === undefined ? undefined : { cause });
    this.name = "AutomationStudioAnswerFirstRunActsUnreadable";
  }
}
