/** A command's first reply in answer-first mode: it does the task, and promises the result. */
export function automationStudioConversationAttemptAnnounce(place: string): string {
  return `I'll do this on ${place} and show you the result here. I'll save how I did it for next time.`;
}
