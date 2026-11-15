export type KeySessionErrorCode =
  | "key.bad_proof"
  | "key.unknown"
  | "key.bad_audience"
  | "key.clock_skew"
  | "key.bad_signature"
  | "key.replayed"
  | "key.unauthorized"
  | "key.bad_enrollment";

/** Deliberately contains no proof, bearer, public key, or account details. */
export class KeySessionError extends Error {
  readonly code: KeySessionErrorCode;
  readonly status: number;
  readonly serverTime: number | undefined;

  constructor(code: KeySessionErrorCode, serverTime?: number) {
    super("The key credential could not be accepted.");
    this.name = "KeySessionError";
    this.code = code;
    this.status = code === "key.bad_proof" || code === "key.bad_enrollment" ? 400 : 401;
    this.serverTime = serverTime;
  }
}
