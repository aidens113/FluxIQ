/** True when the engine refused the person (403): the screen says they have no access, not that something broke. */
export function answerIsDenied(answer: { status?: number }): boolean {
  return answer.status === 403;
}
