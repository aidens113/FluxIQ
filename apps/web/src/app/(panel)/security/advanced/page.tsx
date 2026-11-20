import { SecurityAdvancedPage } from "../../../../features/security";
import { currentFluxIQUser } from "../../../../lib/auth";
import { LoginPanel } from "../../../AuthShell";

/** `/security/advanced`: the users, roles and sign-in rules console. */
export default async function SecurityAdvancedRoute() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <SecurityAdvancedPage user={{
    id: auth.user.id,
    username: auth.user.username,
    displayName: auth.user.displayName,
    roleId: auth.user.roleId,
    totpEnabled: auth.user.totpEnabled,
    pinConfigured: auth.user.pinConfigured
  }} />;
}
