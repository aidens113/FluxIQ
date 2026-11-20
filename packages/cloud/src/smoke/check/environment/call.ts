import type { pinnedHttps } from "../../pinned-https.ts";

type Environment = { environmentId?: string; desired?: string; observed?: string };
type Answer = { ok?: boolean; code?: string; reason?: string; environment?: Environment; environments?: Environment[]; account?: { state?: string; dedicatedEnvironments?: number } | null };

/** One signed-in call to the environment or plan routes, answering its status and its JSON body (a body that is not JSON throws). */
export async function environmentCall(https: ReturnType<typeof pinnedHttps>, session: readonly string[], method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; body: Answer }> {
  const answer = await https({ method, path, session, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let parsed: Answer;
  try { parsed = JSON.parse(answer.body) as Answer; }
  catch { throw new Error(`${method} ${path} answered ${answer.status} with no JSON: ${answer.body.slice(0, 200)}`); }
  return { status: answer.status, body: parsed };
}
