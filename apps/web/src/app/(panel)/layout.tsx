import type { ReactNode } from "react";
import { LoginPanel } from "../AuthShell";
import { currentFluxIQUser } from "../../lib/auth";
import { PanelShell } from "../../features/panel-shell";

// Every panel page sits in the shell. Signed out, the sign-in panel stands where the page would be.
export default async function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <PanelShell>{children}</PanelShell>;
}
