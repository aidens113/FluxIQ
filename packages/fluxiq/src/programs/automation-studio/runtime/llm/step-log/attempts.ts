/** Request ids remembered; the oldest is forgotten past this, so a long-lived Core does not grow without end. */
const REMEMBERED = 4_096;

const seen = new Map<string, number>();

/**
 * Which exchange with this request id this is, counting from 1: the provider
 * retry sends one request id again, and a folder per exchange says which try
 * it was.
 */
export function automationStudioLlmStepLogAttempt(requestId: string | undefined): number {
  if (requestId === undefined) return 1;
  const attempt = (seen.get(requestId) ?? 0) + 1;
  seen.delete(requestId);
  seen.set(requestId, attempt);
  if (seen.size > REMEMBERED) {
    const oldest = seen.keys().next();
    if (!oldest.done) seen.delete(oldest.value);
  }
  return attempt;
}
