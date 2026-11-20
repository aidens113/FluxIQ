import { SecurityKeysPage } from "../../../../features/security";
import { currentFluxIQUser } from "../../../../lib/auth";
import { LoginPanel } from "../../../AuthShell";

/** `/settings/saved-logins`: the logins and keys Flows use on other sites and services (Settings > Advanced). AI keys live on `/settings#ai-keys`. */
export default async function SavedLoginsRoute() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <SecurityKeysPage user={{
    id: auth.user.id,
    displayName: auth.user.displayName,
    roleId: auth.user.roleId,
    totpEnabled: auth.user.totpEnabled,
    pinConfigured: undefined
  }} />;
}
