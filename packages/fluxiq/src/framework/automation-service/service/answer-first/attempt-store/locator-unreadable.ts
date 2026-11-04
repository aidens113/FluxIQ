/** The file that says where attempts are is there and cannot be read: a reader says so rather than calling every attempt "not found". */
export class AutomationStudioAnswerFirstAttemptLocatorUnreadable extends Error {
  readonly name = "AutomationStudioAnswerFirstAttemptLocatorUnreadable";
  readonly code = "answer_first.attempt_locator_unreadable";

  constructor(readonly projectId: string, cause?: unknown) {
    super(`The record of where the attempts of project ${projectId} are kept could not be read.`, cause === undefined ? undefined : { cause });
  }
}
