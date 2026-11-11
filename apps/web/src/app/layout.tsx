import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "@fluxiq/ui-components/styles/fonts.css";
import "@fluxiq/ui-components/styles/tokens.css";
import "./globals.css";
import "./styles/product-branding.css";
import { GlobalClientGatewayPairing } from "./GlobalClientGatewayPairing";
import { GlobalAlertViewport } from "../features/programs/shared-ui";
import { currentFluxIQUser } from "../lib/auth";
import { SessionReauthentication } from "./session-reauthentication";
import { currentPanelBranding } from "./product/server";
import { PanelBrandingProvider } from "./product/client";
import { themeInitScript } from "../features/settings-page/appearance";

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
    <html lang="en" suppressHydrationWarning {...(style ? { style } : {})}>
      <body>
        <PanelBrandingProvider branding={branding}>
          {/* First in the body, so the stored appearance is set before anything paints. */}
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
          {children}
          <GlobalAlertViewport />
          {auth ? <SessionReauthentication /> : null}
          {pairingEligible ? <GlobalClientGatewayPairing asksTotp={auth?.user.totpEnabled === true} /> : null}
        </PanelBrandingProvider>
      </body>
    </html>
  );
}
