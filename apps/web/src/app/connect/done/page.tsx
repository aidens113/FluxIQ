import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { ConnectFrame } from "../../../features/connect";
import { ConnectDone } from "../../../features/connect/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish connecting your browser", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function ConnectDonePage() {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  return <ConnectFrame title="Browser connection">
    {settings.profile === "service" ? <ConnectDone origin={settings.publicOrigin} /> : <p>Hosted browser sign-in is not enabled on this server. <a href="/">Open the panel</a> to pair your browser.</p>}
  </ConnectFrame>;
}
