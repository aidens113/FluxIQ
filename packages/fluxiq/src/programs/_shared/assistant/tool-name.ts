/** Longest name a model provider accepts for a tool. */
export const ASSISTANT_TOOL_NAME_LIMIT = 64;

/**
 * An endpoint's tool name, `<programId>__<endpoint>`: unique across programs
 * (several operator programs share endpoint names) and inside the
 * `[a-zA-Z0-9_-]{1,64}` every provider accepts.
 */
export function assistantToolName(programId: string, endpoint: string): string {
  return `${programId.trim().toLowerCase()}__${endpoint.trim().toLowerCase()}`;
}
