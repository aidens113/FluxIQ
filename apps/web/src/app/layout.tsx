import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import "./styles/product-branding.css";
import { GlobalClientGatewayPairing } from "./GlobalClientGatewayPairing";
import { GlobalConversationPrompt } from "./GlobalConversationPrompt";
import { GlobalAlertViewport } from "../features/programs/shared-ui";
import { currentFluxIQUser } from "../lib/auth";
import { SessionReauthentication } from "./session-reauthentication";
import { currentPanelBranding } from "./product/server";
import { PanelBrandingProvider } from "./product/client";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await currentPanelBranding();
  return {
    title: branding.shortName,
    description: "Domain-neutral automation framework control panel",
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {})
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const branding = await currentPanelBranding();
  const auth = await currentFluxIQUser();
  const pairingEligible = Boolean(auth?.role.permissions.includes("runtime.control"));
  const style = Object.keys(branding.style).length ? (branding.style as CSSProperties) : undefined;
  return (
    <html lang="en" {...(style ? { style } : {})}>
      <body>
        <PanelBrandingProvider branding={branding}>
          {children}
          <GlobalAlertViewport />
          {auth ? <SessionReauthentication /> : null}
          {pairingEligible ? <GlobalClientGatewayPairing /> : null}
          {auth ? <GlobalConversationPrompt /> : null}
        </PanelBrandingProvider>
      </body>
    </html>
  );
}
