import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { GlobalClientGatewayPairing } from "./GlobalClientGatewayPairing";
import { GlobalAlertViewport } from "../features/programs/shared-ui";

export const metadata: Metadata = {
  title: "FluxIQ",
  description: "Domain-neutral automation framework control panel"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <GlobalAlertViewport />
        <GlobalClientGatewayPairing />
      </body>
    </html>
  );
}
