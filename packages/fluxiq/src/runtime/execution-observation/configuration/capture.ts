import type { ManagedExecutionCallbackRegistration } from "../contracts/index.ts";
import type { ExecutionCallbackCompletionConfiguration } from "./configuration.ts";
import type { ExecutionCallbackCompletionPolicy } from "./policy.ts";
import type { ExecutionCallbackRegistrar } from "./registrar.ts";
import { captureExecutionCallbackRegistration } from "./registration.ts";

/** Captures original declarations; it grants no completion or resource baseline. */
export function captureExecutionCallbackCompletions(configuration: ExecutionCallbackCompletionConfiguration): ExecutionCallbackCompletionPolicy {
  const configure = configuration.configure;
  const actions: Array<(registrar: ExecutionCallbackRegistrar) => void> = [];
  let capturing = true;
  const registrar: ExecutionCallbackRegistrar = Object.freeze({
    manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void {
      if (!capturing) throw new Error("execution_observation.configuration_closed");
      const pinned = captureExecutionCallbackRegistration(registration);
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
