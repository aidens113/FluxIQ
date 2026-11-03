import { OwnedExecutionCallback } from "../../../../execution-observation/index.ts";

const completionOf = OwnedExecutionCallback.prototype.completion;

/** A native business refusal retains the exact actual call, not a reason-string certificate. */
export class SecretProviderKeyRefusalError extends Error {
  readonly #owner: object;
  readonly #returned: Promise<unknown>;
  readonly #entered: object;

  constructor(message: string, originalOwner: object, originalReturned: Promise<unknown>, entered: object) {
    super(message);
    completionOf.call(entered as OwnedExecutionCallback<unknown, unknown[], unknown>);
    this.name = "SecretProviderKeyRefusalError";
    this.#owner = originalOwner;
    this.#returned = originalReturned;
    this.#entered = entered;
  }

  static owns(error: unknown): error is SecretProviderKeyRefusalError {
    return error !== null && (typeof error === "object" || typeof error === "function") && #owner in error;
  }

  completedFor(originalOwner: object, originalReturned: Promise<unknown>): boolean {
    return this.#owner === originalOwner && this.#returned === originalReturned && completionOf.call(this.#entered as OwnedExecutionCallback<unknown, unknown[], unknown>) === "settled";
  }
}
