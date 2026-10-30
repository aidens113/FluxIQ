/**
 * The primary workspace's id: the web server's own instance, the one every
 * account belongs to while provisioning is single-tenancy.
 * `FLUXIQ_WORKSPACE_ID` when set, else `workspace-main`.
 */
export function primaryWorkspaceId(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.FLUXIQ_WORKSPACE_ID?.trim() || "workspace-main";
}
