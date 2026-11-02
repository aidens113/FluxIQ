import type { ManagedExecutionCallbackRegistration } from "../contracts/index.ts";
import type { ExecutionCallbackCompletionConfiguration } from "./configuration.ts";
import type { ExecutionCallbackCompletionPolicy } from "./policy.ts";
import type { ExecutionCallbackRegistrar } from "./registrar.ts";

/** Captures original declarations; it grants no completion or resource baseline. */
export function captureExecutionCallbackCompletions(configuration: ExecutionCallbackCompletionConfiguration): ExecutionCallbackCompletionPolicy {
  const configure = configuration.configure;
  const actions: Array<(registrar: ExecutionCallbackRegistrar) => void> = [];
  let capturing = true;
  const registrar: ExecutionCallbackRegistrar = Object.freeze({
    manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void {
      if (!capturing) throw new Error("execution_observation.configuration_closed");
      const receiver = registration.receiver;
      const callback = registration.callback;
      const binding = registration.binding;
      const contract = registration.contract;
      if (typeof callback !== "function") throw new Error("execution_observation.invalid_callback");
      const identity = { receiver, callback, ...(binding !== undefined ? { binding } : {}) };
      let pinned: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>;
      if (contract === "no_direct_effects") pinned = Object.freeze({ ...identity, contract });
      else if (contract === "managed_direct_effects") {
        const consumeCompletion = registration.consumeCompletion.bind(registration);
        pinned = Object.freeze({ ...identity, contract, consumeCompletion });
      } else throw new Error("execution_observation.invalid_completion_contract");
      actions.push(Object.freeze((target: ExecutionCallbackRegistrar) => target.manage(pinned)));
    }
  });
  try {
    const returned: unknown = configure.call(configuration, registrar);
    if (returned !== undefined) {
      const failure = new Error("execution_observation.configuration_must_be_synchronous");
      let cause: unknown;
      Object.defineProperty(failure, "cause", { get: () => cause });
      // Capture is refused now; retain any later rejection on the same reported error.
      void Promise.resolve(returned).then(() => undefined, error => {
        cause = error;
      });
      throw failure;
    }
  } finally {
    capturing = false;
  }
  Object.freeze(actions);
  return Object.freeze({
    apply(target: ExecutionCallbackRegistrar): void {
      for (const action of actions) action(target);
    }
  });
}
