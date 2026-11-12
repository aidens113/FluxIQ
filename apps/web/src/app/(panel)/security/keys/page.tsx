import { SecurityKeysPage } from "../../../../features/security";
import { currentFluxIQUser } from "../../../../lib/auth";
import { LoginPanel } from "../../../AuthShell";

/** `/security/keys`: every stored key, where /programs/secret-keys used to be. */
export default async function SecurityKeysRoute() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <SecurityKeysPage user={{
    id: auth.user.id,
    displayName: auth.user.displayName,
    roleId: auth.user.roleId,
    totpEnabled: auth.user.totpEnabled,
    pinConfigured: auth.user.pinConfigured
  }} />;
}
