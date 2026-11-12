import type { ReactNode } from "react";
import { LoginPanel } from "../AuthShell";
import { currentFluxIQUser } from "../../lib/auth";
import { PanelShell } from "../../features/panel-shell";
import { currentPanelPreset } from "../product";

// Every panel page sits in the shell. Signed out, the sign-in panel stands where the page would be.
// The deployment's preset picks which screens the shell lists; each hidden screen's route refuses too.
export default async function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  const preset = currentPanelPreset();
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  return <PanelShell pages={preset.pages}>{children}</PanelShell>;
}
