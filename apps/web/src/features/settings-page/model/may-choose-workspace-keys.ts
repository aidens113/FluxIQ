/**
 * Whether a signed-in person may change the workspace's default key and the
 * assistant's key and model, from the permissions of their role (what the
 * panel's session already carries). Core decides `secrets:SetDefaultKey` and
 * `secrets:SetAssistantModel` on the workspace:
 *
 * - local and self-hosted: exactly the role's `secrets.manage` (the `admin`
 *   role holds it, `viewer` does not);
 * - hosted: the Owner and Administrator policies, whose members get the
 *   `admin` role; every other member gets `viewer` and is refused.
 *
 * So `secrets.manage` offers the choice to exactly the people the server
 * allows under the predefined policies.
 */
export function mayChooseWorkspaceKeys(rolePermissions: readonly string[]): boolean {
  return rolePermissions.includes("secrets.manage");
}
