/** Whose an FRN is: one workspace's, the platform's (no workspace), or not readable. */
export type FrnScope = { kind: "workspace"; workspaceId: string; type: string; id: string } | { kind: "platform"; type: string; id: string } | { kind: "unknown" };

const PREFIX = "frn:fluxiq:";

/**
 * Reads the scope of an FRN, `frn:fluxiq:<service>:<workspace>:<type>/<path>`.
 * A workspace segment makes it that workspace's; so does the platform's own
 * workspace FRN (`frn:fluxiq:platform::workspace/<id>`). Any other FRN with
 * no workspace (an account, a managed policy, a service identity, an operator
 * program) is the platform's. Anything else is `unknown`, which no workspace
 * may read.
 */
export function frnScope(value: string): FrnScope {
  if (!value.startsWith(PREFIX)) return { kind: "unknown" };
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return { kind: "unknown" };
  const [service, workspace, resource] = parts as [string, string, string];
  const slash = resource.indexOf("/");
  if (service === "" || slash <= 0 || slash === resource.length - 1) return { kind: "unknown" };
  const type = resource.slice(0, slash);
  const id = resource.slice(slash + 1);
  if (workspace !== "") return { kind: "workspace", workspaceId: workspace, type, id };
  if (service === "platform" && type === "workspace") return { kind: "workspace", workspaceId: id, type, id };
  return { kind: "platform", type, id };
}
