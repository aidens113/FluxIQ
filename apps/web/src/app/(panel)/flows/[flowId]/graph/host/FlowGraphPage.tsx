"use client";

import Link from "next/link";
import { FlowGraphEditor } from "./FlowGraphEditor";

/**
 * The graph route's page. The Flow's own Advanced link names the project; a link without one is
 * sent back to the Flow, which finds its project and links here properly.
 */
export function FlowGraphPage(props: { flowId: string; projectId?: string }) {
  if (props.projectId) return <FlowGraphEditor flowId={props.flowId} projectId={props.projectId} />;
  return (
    <div className="flow-graph">
      <h1>Graph</h1>
      <p role="status">
        This link does not say which project the Flow is in. <Link href={`/flows/${encodeURIComponent(props.flowId)}`}>Open the Flow</Link> and choose Advanced, then the graph.
      </p>
    </div>
  );
}
