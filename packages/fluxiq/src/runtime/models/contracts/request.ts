/** The request boundary generic provider execution needs; task content belongs to its adapter. */
export type ModelRequest = { timeoutMs: number; requestId?: string; idempotencyKey?: string };
