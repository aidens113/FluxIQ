import { FlowEditorPage } from "../../../../features/flows";

type FlowPageProps = {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PanelFlowPage(props: FlowPageProps) {
  const { flowId } = await props.params;
  const query = await props.searchParams;
  const projectId = typeof query.project === "string" && query.project ? query.project : undefined;
  return <FlowEditorPage flowId={flowId} {...(projectId ? { projectId } : {})} />;
}
