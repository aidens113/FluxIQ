import type { IamStoreErrorCode } from "./store-error-code.ts";

/** A typed refusal from the IAM store: `code` is for callers, `message` is plain English. */
export class IamStoreError extends Error {
  readonly code: IamStoreErrorCode;

  constructor(code: IamStoreErrorCode, message: string) {
    super(message);
    this.name = "IamStoreError";
    this.code = code;
  }
}
