/**
 * The `secrets.locked` sentence for a person whose message another person's
 * key pays for: the workspace's key, chosen by an owner or administrator and
 * offered by its holder. Their own password cannot open it, so they are told
 * the workspace's key is locked and its owner must unlock it, never "your
 * model key". The holder's own message keeps `secretsLockedMessage`.
 */
export function workspaceKeyLockedMessage(instanceHost: string): string {
  return `This workspace's model key is locked: its owner must unlock it by opening ${instanceHost} and entering their password once`;
}
