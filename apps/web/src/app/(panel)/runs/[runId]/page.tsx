import { RunPage } from "../../../../features/runs";
import { requirePanelScreen } from "../../../product";

export default async function PanelRunPage(props: { params: Promise<{ runId: string }> }) {
  requirePanelScreen("runs");
  const { runId } = await props.params;
  return <RunPage runId={runId} />;
}
