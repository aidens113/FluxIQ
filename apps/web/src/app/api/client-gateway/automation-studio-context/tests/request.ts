import { routeRequest } from "../../../../../lib/workspaces/routes/tests/route-runtime";

export function contextRequest(body: unknown, options: { cookie?: string | null; bearer?: string; domain?: string; signal?: AbortSignal } = {}) {
  const selected = routeRequest({ ...options, url: `https://panel.example.test/api/client-gateway/automation-studio-context?domainId=${options.domain ?? "domain-a"}` });
  return new Request(selected, { method: "POST", body: JSON.stringify(body), headers: new Headers([...selected.headers, ["content-type", "application/json"]]) });
}
