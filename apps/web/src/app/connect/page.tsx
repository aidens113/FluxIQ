import { ConnectFrame } from "../../features/connect";
import { OpenPanelLink } from "./OpenPanelLink";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect a browser", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function ConnectPage() {
  return <ConnectFrame title="Connect a browser">
    <p>To connect a browser, open the FluxIQ extension and choose this server.</p>
    <p>You do not type a code here. The extension shows a code, and you approve it in FluxIQ.</p>
    <OpenPanelLink />
  </ConnectFrame>;
}
