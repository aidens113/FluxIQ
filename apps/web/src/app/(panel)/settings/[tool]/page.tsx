import { requirePanelSettingsTool } from "../../../product";
import { SettingsToolPage } from "../../../../features/settings-page";
import { currentFluxIQUser } from "../../../../lib/auth";
import { LoginPanel } from "../../../AuthShell";

type SettingsToolRouteProps = { params: Promise<{ tool: string }> };

/** `/settings/<id>`: one engine tool, where its old /programs/<id> page used to be. */
export default async function SettingsToolRoute(props: SettingsToolRouteProps) {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  const tool = requirePanelSettingsTool((await props.params).tool);
  return <SettingsToolPage tool={tool} user={{
    id: auth.user.id,
    displayName: auth.user.displayName,
    roleId: auth.user.roleId,
    totpEnabled: auth.user.totpEnabled,
    pinConfigured: auth.user.pinConfigured
  }} />;
}
