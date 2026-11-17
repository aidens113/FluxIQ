/**
 * One section's data: still loading, could not be read, or here. A section never fails the page.
 * A refresh that fails after a good read keeps that data with `stale`; `retry` reads again now.
 */
export type Resource<T> =
  | { state: "loading" }
  | { state: "error"; retry?: () => void }
  | { state: "ready"; data: T; stale?: boolean; retry?: () => void };
