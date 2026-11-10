"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { findFlowProject } from "../data";
import { useLoaded } from "../use-loaded";
import { FlowEditor } from "./FlowEditor";
import "../flows.css";

/**
 * The editor's page. A link that names the project (`/flows/<id>?project=<id>`, the list's own)
 * opens at once; a link that names only the Flow (Home's) finds its project first.
 */
export function FlowEditorPage(props: { flowId: string; projectId?: string }) {
  const studio = useProgramTransport("automation-studio");
  const { flowId, projectId } = props;
  const found = useLoaded(projectId ? null : flowId, useCallback((signal: AbortSignal) => findFlowProject(studio, flowId, signal), [studio, flowId]));
  if (projectId) return <FlowEditor projectId={projectId} flowId={flowId} />;
  if (found.state === "loading") return <p className="flows-note" role="status">Finding this Flow…</p>;
  if (found.state === "error") return <p className="flows-note flows-error" role="alert">This Flow could not be found: {found.message} <button type="button" onClick={found.reload}>Try again</button></p>;
  if (!found.data) {
    return (
      <div className="flows">
        <h1>Flow not found</h1>
        <p className="flows-note">No project you can open holds this Flow. It may have been deleted. <Link href="/flows">See your Flows</Link></p>
      </div>
    );
  }
  return <FlowEditor projectId={found.data} flowId={flowId} />;
}
