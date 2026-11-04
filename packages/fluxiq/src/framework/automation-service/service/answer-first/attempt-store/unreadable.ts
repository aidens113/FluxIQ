/** The attempts file is there and cannot be read: a reader says so rather than showing a person's result as never having happened. */
export class AutomationStudioAnswerFirstAttemptsUnreadable extends Error {
  readonly name = "AutomationStudioAnswerFirstAttemptsUnreadable";
  readonly code = "answer_first.attempts_unreadable";

  constructor(readonly flowId: string, cause?: unknown) {
    super(`The attempts kept for Flow ${flowId} could not be read.`, cause === undefined ? undefined : { cause });
  }
}
