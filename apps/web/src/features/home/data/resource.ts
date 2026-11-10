/** One section's data: still loading, could not be read, or here. A section never fails the page. */
export type Resource<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };
