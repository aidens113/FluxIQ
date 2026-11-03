import { createActionInstructionAuthority, type ActionInstructionReader } from "../../action-permissions/instruction/once/index.ts";
import type { ExecutionObservationSource } from "../../execution-observation/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";
import { AuthoringExecutionScope, invokeAuthoringExecutionCallback } from "../execution/observation/index.ts";

/** The generic one-read cache delegates under the actual current, already entered callback. */
export function createObservedActionInstructionAuthority(reader: ActionInstructionReader, callbacks: ExecutionObservationSource): ReturnType<typeof createActionInstructionAuthority> {
  const starting = Object.freeze({});
  const authority = createActionInstructionAuthority({
    read: () => {
      const original = AuthoringExecutionScope.of(starting);
      if (!original || original.context.callbacks !== callbacks) throw new Error("instruction_observation.current_scope_required");
      return invokeAuthoringExecutionCallback(starting, { receiver: reader, callback: reader.read, args: [] });
    }
  });
  const current = <T>(receiver: unknown, body: () => T): T => {
    const original = receiver !== null && (typeof receiver === "object" || typeof receiver === "function") ? AuthoringExecutionScope.of(receiver) : undefined;
    if (!original) throw new Error("instruction_observation.current_scope_required");
    if (original.context.callbacks !== callbacks) throw new Error("instruction_observation.foreign_source");
    const scoped = new AuthoringExecutionScope(starting, original.context, original.options, AuthoringExecutionScope.of(starting));
    // The cache starts its one reader synchronously. Only that start needs this
    // handoff; the real child invocation retains its own original scope until ACK.
    try { return body(); }
    finally { scoped.close(); }
  };
  function derive(this: unknown) { return current(this, () => authority.derive()); }
  function read(this: unknown) { return current(this, () => authority.route.read()); }
  const peek = () => authority.route.peek();
  ExecutionCallbackPolicies.rememberLexical(derive, "frame");
  ExecutionCallbackPolicies.rememberLexical(read, "frame");
  ExecutionCallbackPolicies.rememberLexical(peek, "pure");
  return { derive, route: { read, peek } };
}
