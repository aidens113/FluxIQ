import { SecuritySignInPage } from "../../../../features/security";
import { currentFluxIQUser } from "../../../../lib/auth";
import { LoginPanel } from "../../../AuthShell";

/** `/security/sign-in`: your own sign-in security, where /programs/identity-access used to be. */
export default async function SecuritySignInRoute() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <SecuritySignInPage user={{
    id: auth.user.id,
    displayName: auth.user.displayName,
    roleId: auth.user.roleId,
    totpEnabled: auth.user.totpEnabled,
    pinConfigured: auth.user.pinConfigured
  }} />;
}
