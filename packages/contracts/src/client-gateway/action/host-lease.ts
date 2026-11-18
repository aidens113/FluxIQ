/**
 * The host lease a command is issued under (automation-project-agents-plan,
 * `Host resources and concurrency`). Core's gateway stamps it from the
 * scheduler's scope; a caller never writes it. `resourceKey` is opaque to Core
 * and names the domain's resource (for the web extension, its automation tab);
 * `epoch` rises every time the resource is granted again, so a client refuses a
 * command whose epoch is lower than the highest it has seen for that key.
 */
export type ClientGatewayHostLease = {
  resourceKey: string;
  epoch: number;
  holder: { role: string; briefId: string };
};
