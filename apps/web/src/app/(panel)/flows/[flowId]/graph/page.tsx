import { FlowGraphPage } from "./host";

type FlowGraphRouteProps = {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** A Flow's graph editor, under the Flow's Advanced section: `/flows/<id>/graph?project=<id>`. */
export default async function PanelFlowGraphPage(props: FlowGraphRouteProps) {
  const { flowId } = await props.params;
  const query = await props.searchParams;
  const projectId = typeof query.project === "string" && query.project ? query.project : undefined;
  return <FlowGraphPage flowId={flowId} {...(projectId ? { projectId } : {})} />;
}
