/** What a reply's envelope says, read once for `response.txt` and the step's meta. */
export type AutomationStudioLlmStepLogReply = {
  envelope: Record<string, unknown> | undefined;
  finishReason: string | undefined;
  text: string;
};
