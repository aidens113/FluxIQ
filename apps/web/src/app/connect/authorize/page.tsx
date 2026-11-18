import { LoginPanel } from "../../AuthShell";
import { ConnectConsent, ConnectFrame } from "../../../features/connect";
import { connectPageParams } from "../../../features/connect/model";
import { prepareConnectConsent } from "../../../features/connect/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect your browser to FluxIQ", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function ConnectAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await prepareConnectConsent(connectPageParams(await searchParams));
  if (view.kind === "login") return <div className="connect-login">
    <LoginPanel />
    {view.signUpUrl ? <p><a href={view.signUpUrl} referrerPolicy="no-referrer">Create an account to connect your browser</a></p> : null}
  </div>;
  return <ConnectFrame title="Connect your browser">
    {view.kind === "consent" ? <ConnectConsent view={view} /> : null}
    {view.kind === "unavailable" ? <p>Hosted browser sign-in is not enabled on this server. <a href="/">Open the panel</a> to pair your browser.</p> : null}
    {view.kind === "invalid" ? <p role="alert">This connection request is invalid. Start a new connection from the FluxIQ extension.</p> : null}
    {view.kind === "refused" ? <p role="alert">{view.message}</p> : null}
  </ConnectFrame>;
}
