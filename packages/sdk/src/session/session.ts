// What the transport asks before each call: the headers that authenticate it.

/** `headers` gives the call's headers, renewing the session when it is near its end; `invalidate` forgets the session after a 401. */
export type Session = {
  headers(): Promise<Record<string, string>>;
  invalidate(): void;
};
