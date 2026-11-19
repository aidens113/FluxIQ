/** An operation id a person's client chooses: one plain token, repeated to retry the same operation. */
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

/**
 * The JSON body of an environment operation: its `operationId` (required),
 * and for a create an optional `environmentId`. Answers null for anything
 * else, text that is not JSON included.
 */
export function readOperation(rawBody: string): { operationId: string; environmentId: string | null } | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { operationId, environmentId } = body as { operationId?: unknown; environmentId?: unknown };
  if (typeof operationId !== "string" || !OPERATION_ID.test(operationId)) return null;
  if (environmentId !== undefined && typeof environmentId !== "string") return null;
  return { operationId, environmentId: environmentId ?? null };
}
