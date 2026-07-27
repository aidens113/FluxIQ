import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FluxIQ",
  description: "Domain-neutral automation framework control panel"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
