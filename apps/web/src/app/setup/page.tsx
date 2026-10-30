import { notFound } from "next/navigation";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getFluxIQ } from "../../lib/fluxiq";
import { isOwnerClaimOpen } from "../../server/owner-claim";
import { AccountLinkFrame } from "../welcome/client";
import { SetupClient } from "./SetupClient";

export const metadata = { title: "Set up FluxIQ", referrer: "no-referrer" };
// The claim state is read on every request: the page disappears once claimed.
export const dynamic = "force-dynamic";

/** The owner claim on `self-hosted` and `service`: not found on `local` and once the owner is claimed. */
export default async function SetupPage() {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  if (settings.profile === "local" || !(await isOwnerClaimOpen(settings, getFluxIQ().paths.fluxiq))) notFound();
  return <AccountLinkFrame title="Set up FluxIQ"><SetupClient /></AccountLinkFrame>;
}
