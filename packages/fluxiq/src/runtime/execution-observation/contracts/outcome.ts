export type ExecutionCallbackOutcome<T> =
  | { readonly kind: "fulfilled"; readonly value: T }
  | { readonly kind: "rejected"; readonly error: unknown };
