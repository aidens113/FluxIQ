import { RunPage } from "../../../../features/runs";

export default async function PanelRunPage(props: { params: Promise<{ runId: string }> }) {
  const { runId } = await props.params;
  return <RunPage runId={runId} />;
}
