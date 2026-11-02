import { AuthoringExecutionScope } from "./scope.ts";

/** Forward an already entered Core frame and restore its exact private owners. */
export async function withAuthoringExecutionScope<T>(current: AuthoringExecutionScope | undefined, targets: readonly object[], body: () => Promise<T>): Promise<T> {
  if (!current) return await body();
  if (AuthoringExecutionScope.of(current.invocation) !== current) throw new Error("execution_observation.scope_not_current");
  const scopes: AuthoringExecutionScope[] = [];
  let primary: { error: unknown } | undefined;
  try {
    for (const target of new Set(targets)) {
      const previous = AuthoringExecutionScope.of(target);
      if (previous && (previous.context.callbacks !== current.context.callbacks || previous.context.parent.reservation !== current.context.parent.reservation || previous.context.toolObserver !== current.context.toolObserver)) throw new Error("execution_observation.foreign_plan_scope");
      scopes.push(new AuthoringExecutionScope(target, current.context, current.options, previous));
    }
    return await body();
  } catch (error) {
    primary = { error };
    throw error;
  } finally {
    const errors: unknown[] = [];
    for (const scope of scopes.reverse()) {
      try { scope.close(); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) {
      if (primary) throw new AggregateError([primary.error, ...errors], "Plan permission and scope restoration failed.");
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, "Plan permission scope restoration failed.");
    }
  }
}
