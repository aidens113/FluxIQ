import { SECURITY_TOOLS, SettingsPage, mayChooseWorkspaceKeys } from "../../../features/settings-page";
import { currentFluxIQUser } from "../../../lib/auth";
import { currentPanelPreset, settingsToolsForPreset } from "../../product";

/** Settings. Who may choose the workspace's default and assistant key is decided here, from the signed-in role, so the page never offers a change the server refuses. */
export default async function SettingsRoute() {
  const auth = await currentFluxIQUser();
  return (
    <SettingsPage
      engineTools={[...settingsToolsForPreset(currentPanelPreset()), ...SECURITY_TOOLS]}
      mayChooseForWorkspace={mayChooseWorkspaceKeys(auth?.role.permissions ?? [])}
    />
  );
}
