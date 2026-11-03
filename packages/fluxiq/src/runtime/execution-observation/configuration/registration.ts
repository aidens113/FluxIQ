import type { ManagedExecutionCallbackRegistration } from "../contracts/index.ts";

/** Captures one original declaration without changing its receiver, tuple or completion reader. */
export function captureExecutionCallbackRegistration<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult> {
  const receiver = registration.receiver;
  const callback = registration.callback;
  const binding = registration.binding;
  const contract = registration.contract;
  if (typeof callback !== "function") throw new Error("execution_observation.invalid_callback");
  const identity = { receiver, callback, ...(binding !== undefined ? { binding } : {}) };
  if (contract === "no_direct_effects") return Object.freeze({ ...identity, contract });
  if (contract === "managed_direct_effects") {
    const consumeCompletion = registration.consumeCompletion.bind(registration);
    return Object.freeze({ ...identity, contract, consumeCompletion });
  }
  throw new Error("execution_observation.invalid_completion_contract");
}
