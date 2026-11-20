// The answer to one request on the model-keys port. A failure carries the sentence a person reads.

/** `{ ok: true }` plus whatever the request returns, or `{ ok: false, message }`. A key's value is never part of an answer. */
export type ModelKeysResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; message: string };
