import { FLUXNODE_API_BASE_PATH, type FluxNodeApiEndpoint } from "@fluxiq/contracts/fluxnode";

/** Which endpoint a path is, with its parameters decoded; `malformed` when a segment is not valid percent-encoding. */
export type FluxNodeRoute = { endpoint: FluxNodeApiEndpoint; runId?: string; name?: string } | { endpoint: "malformed" } | { endpoint: "unknown" };

/** Matches a path under `FLUXNODE_API_BASE_PATH` to an endpoint of the contracts. */
export function routeFluxNodePath(pathname: string): FluxNodeRoute {
  const rest = pathname.slice(FLUXNODE_API_BASE_PATH.length).replace(/^\//u, "");
  const raw = rest === "" ? [] : rest.split("/");
  const parts: string[] = [];
  for (const part of raw) {
    try {
      parts.push(decodeURIComponent(part));
    } catch (error) {
      if (error instanceof URIError) return { endpoint: "malformed" };
      throw error;
    }
  }
  if (parts.some((part) => part === "")) return { endpoint: "unknown" };
  const [first, second, third] = parts;
  if (parts.length === 1 && first === "specs") return { endpoint: "specs" };
  if (parts.length === 1 && first === "runs") return { endpoint: "runs" };
  if (first === "runs" && second !== undefined) {
    if (parts.length === 2) return { endpoint: "run", runId: second };
    if (parts.length === 3 && third === "events") return { endpoint: "runEvents", runId: second };
    if (parts.length === 3 && third === "answers") return { endpoint: "runAnswers", runId: second };
    if (parts.length === 3 && third === "stop") return { endpoint: "runStop", runId: second };
  }
  if (parts.length === 3 && first === "fluxnodes" && second !== undefined && third === "export") return { endpoint: "fluxNodeExport", name: second };
  return { endpoint: "unknown" };
}
