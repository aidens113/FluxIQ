import { notFound } from "next/navigation";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { platformScope } from "../../lib/platform";
import { isOwnerClaimOpen } from "../../server/owner-claim";
import { AccountLinkFrame } from "../welcome/client";
import { LocalSetupClient } from "./LocalSetupClient";
import { SetupClient } from "./SetupClient";

export const metadata = { title: "Set up FluxIQ", referrer: "no-referrer" };
// The claim state is read on every request: the page disappears once claimed.
export const dynamic = "force-dynamic";

/**
 * The owner claim. On `local`, while no owner exists (no account, or the
 * default admin still on its temporary password), the page the printed setup
 * link opens. On `self-hosted` and `service`, the setup-code form until the
 * owner is claimed. Not found otherwise.
 */
export default async function SetupPage() {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  const { identityAccess, fluxiqDir } = platformScope();
  if (settings.profile === "local") {
    if ((await identityAccess.firstRun.state()) === "claimed") notFound();
    return <AccountLinkFrame title="Set up FluxIQ"><LocalSetupClient /></AccountLinkFrame>;
  }
  if (!(await isOwnerClaimOpen(settings, fluxiqDir))) notFound();
  return <AccountLinkFrame title="Set up FluxIQ"><SetupClient service={settings.profile === "service"} /></AccountLinkFrame>;
}
