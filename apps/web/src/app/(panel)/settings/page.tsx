import { SECURITY_TOOLS, SettingsPage } from "../../../features/settings-page";
import { currentPanelPreset, settingsToolsForPreset } from "../../product";

export default function SettingsRoute() {
  return <SettingsPage engineTools={[...settingsToolsForPreset(currentPanelPreset()), ...SECURITY_TOOLS]} />;
}
