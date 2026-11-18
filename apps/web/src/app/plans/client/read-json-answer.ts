/**
 * A route's JSON answer: its status and parsed body, or `body: null` with the
 * reason when the server answered something that is not JSON (a proxy's
 * error page), so the caller can say the answer was unreadable.
 */
export async function readJsonAnswer(response: Response): Promise<{ status: number; ok: boolean; body: unknown; unreadable: string | null }> {
  const text = await response.text();
  try {
    return { status: response.status, ok: response.ok, body: JSON.parse(text) as unknown, unreadable: null };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: response.status, ok: response.ok, body: null, unreadable: `The server answered ${response.status} with something that is not JSON.` };
  }
}
