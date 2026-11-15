import { ConnectFrame } from "../../features/connect";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect a browser", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function ConnectPage() {
  return <ConnectFrame title="Connect a browser">
    <p>Open the FluxIQ browser extension and choose this server to start a secure connection.</p>
    <p>Typed pairing codes are not available here. <a href="/">Open the panel</a> for existing local pairing.</p>
  </ConnectFrame>;
}
