import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { ConnectFrame } from "../../../features/connect";
import { OpenPanelLink } from "../OpenPanelLink";
import { ConnectDone } from "../../../features/connect/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish connecting your browser", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function ConnectDonePage() {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  return <ConnectFrame title="Browser connection">
    {settings.profile === "service" ? <ConnectDone origin={settings.publicOrigin} /> : <><p>Signing in from the browser is not switched on for this server. Pair your browser from FluxIQ instead.</p><OpenPanelLink /></>}
  </ConnectFrame>;
}
