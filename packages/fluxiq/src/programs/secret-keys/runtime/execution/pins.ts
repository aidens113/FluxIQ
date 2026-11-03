import { ExecutionCallbackPolicies } from "../../../../runtime/execution-observation/index.ts";
import { HeldKeys } from "../held-keys.ts";
import { SecretValueSealer } from "../value-sealer.ts";
import type { SecretKeysOperationContext } from "./owner/index.ts";

const nativeNow = Date.now;
const nativeStartTimer = setTimeout;
const nativeCancelTimer = clearTimeout;
const nativeHeld = Object.freeze({
  authorization: HeldKeys.prototype.authorization, session: HeldKeys.prototype.session, sessionsFor: HeldKeys.prototype.sessionsFor,
  holdAuthorization: HeldKeys.prototype.holdAuthorization, authorizationExpiryTimer: HeldKeys.prototype.authorizationExpiryTimer,
  revokeAuthorization: HeldKeys.prototype.revokeAuthorization, revokeSession: HeldKeys.prototype.revokeSession
});
const nativeSealer = Object.freeze({ open: SecretValueSealer.prototype.open, openRecordWithKey: SecretValueSealer.prototype.openRecordWithKey, parametersOf: SecretValueSealer.prototype.parametersOf });

/** Original data methods alone receive read-only declarations. Native mutations stay in their owner. */
export class SecretKeysOperationPins {
  readonly authorization;
  readonly session;
  readonly sessionsFor;
  readonly holdAuthorization;
  readonly authorizationExpiryTimer;
  readonly revokeAuthorization;
  readonly revokeSession;
  readonly open;
  readonly openRecordWithKey;
  readonly parametersOf;
  readonly startTimer = setTimeout;
  readonly cancelTimer = clearTimeout;

  constructor(readonly context: SecretKeysOperationContext, observed = false) {
    const held = context.heldKeys;
    if (observed && (!HeldKeys.owns(held) || Object.getPrototypeOf(held) !== HeldKeys.prototype)) throw new Error("secret.execution.custody_unverified");
    if (observed) for (const key of ["authorization", "session", "sessionsFor", "holdAuthorization", "authorizationExpiryTimer", "revokeAuthorization", "revokeSession"]) {
      const descriptor = Object.getOwnPropertyDescriptor(held, key) ?? Object.getOwnPropertyDescriptor(HeldKeys.prototype, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("secret.execution.custody_accessor_unverified");
    }
    this.authorization = held.authorization;
    this.session = held.session;
    this.sessionsFor = held.sessionsFor;
    this.holdAuthorization = held.holdAuthorization;
    this.authorizationExpiryTimer = held.authorizationExpiryTimer;
    this.revokeAuthorization = held.revokeAuthorization;
    this.revokeSession = held.revokeSession;
    this.open = context.sealer.open;
    this.openRecordWithKey = context.sealer.openRecordWithKey;
    this.parametersOf = context.sealer.parametersOf;
  }

  static declare(context: SecretKeysOperationContext): void {
    if (context.now === nativeNow) ExecutionCallbackPolicies.remember(context.original, context.now, "pure");
    if (HeldKeys.owns(context.heldKeys)) for (const callback of [nativeHeld.authorization, nativeHeld.session, nativeHeld.sessionsFor]) ExecutionCallbackPolicies.remember(context.heldKeys, callback, "pure");
    ExecutionCallbackPolicies.remember(context.sealer, nativeSealer.openRecordWithKey, "pure");
    ExecutionCallbackPolicies.remember(context.sealer, nativeSealer.parametersOf, "pure");
  }

  nativeMutation(callback: object): boolean {
    const held = this.context.heldKeys;
    if (!HeldKeys.owns(held)) return false;
    if (callback === nativeHeld.holdAuthorization) return true;
    if (callback === nativeHeld.revokeAuthorization || callback === nativeHeld.revokeSession) return this.cancelTimer === nativeCancelTimer;
    return callback === nativeHeld.authorizationExpiryTimer && this.startTimer === nativeStartTimer && this.cancelTimer === nativeCancelTimer;
  }

  assertSealer(): void {
    if (this.open !== nativeSealer.open || this.openRecordWithKey !== nativeSealer.openRecordWithKey || this.parametersOf !== nativeSealer.parametersOf || this.context.sealer.open !== this.open) throw new Error("secret.execution.sealer_unverified");
  }
}
