import { SecurityPeoplePage } from "../../../../features/security";
import { currentFluxIQUser } from "../../../../lib/auth";
import { LoginPanel } from "../../../AuthShell";

/** `/security/people`: the page learns whether the viewer has two-step sign-in on, so a confirmation asks for a code only then. */
export default async function SecurityPeopleRoute() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <SecurityPeoplePage twoStep={auth.user.totpEnabled} />;
}
