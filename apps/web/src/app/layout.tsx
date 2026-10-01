import type { Metadata } from "next";
import "./globals.css";
import { GlobalClientGatewayPairing } from "./GlobalClientGatewayPairing";
import { GlobalConversationPrompt } from "./GlobalConversationPrompt";
import { GlobalAlertViewport } from "../features/programs/shared-ui";
import { currentFluxIQUser } from "../lib/auth";
import { SessionReauthentication } from "./session-reauthentication";

export const metadata: Metadata = {
  title: "FluxIQ",
  description: "Domain-neutral automation framework control panel"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const auth = await currentFluxIQUser();
  const pairingEligible = Boolean(auth?.role.permissions.includes("runtime.control"));
  return (
    <html lang="en">
      <body>
        {children}
        <GlobalAlertViewport />
        {auth ? <SessionReauthentication /> : null}
        {pairingEligible ? <GlobalClientGatewayPairing /> : null}
        {auth ? <GlobalConversationPrompt /> : null}
      </body>
    </html>
  );
}
