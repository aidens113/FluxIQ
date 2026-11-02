// An output may answer which of its node's routes a success takes by naming
// it in its result payload, as `route`: a list that has no further page, say.
// Only a success is lifted, and never onto `success` or `failed`, which are
// the dispatch's own to say; whether the node declares that route is the
// executor's to check (`executor/node-execution.ts`).
export function dispatchedRoute(payload: unknown): string {
  const route = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as {
    route?: unknown;
  }).route : undefined;
  return typeof route === "string" && route.length > 0 && route !== "success" && route !== "failed" ? route : "success";
}
