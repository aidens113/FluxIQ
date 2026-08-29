"use client";

import { Trash2 } from "lucide-react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { automationEdgeRoute, automationLaneEdgePath, automationLoopEdgePath } from "../graph/edge-routing";
import { useFlowEditorActions } from "./FlowEditorActionsContext";
export function FlowEdge(props: EdgeProps) {
  const actions = useFlowEditorActions();
  const route = automationEdgeRoute(props.id, props.sourceX, props.sourceY, props.targetX, props.targetY, props.data as Record<string, unknown> | undefined);
  const [edgePath, labelX, labelY] = route.kind === "loop"
    ? automationLoopEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane)
    : automationLaneEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane);
  const label = String(props.label ?? props.data?.label ?? "");
  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        interactionWidth={24}
        style={{
          ...props.style,
          strokeWidth: props.selected ? 4 : props.style?.strokeWidth
        }}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          actions.selectEdge(props.id);
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <span className={props.selected ? "automation-edge-label selected nodrag nopan" : "automation-edge-label nodrag nopan"} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span>
        </EdgeLabelRenderer>
      ) : null}
      {props.selected ? (
        <EdgeLabelRenderer>
          <button
            className="automation-edge-delete-button nodrag nopan"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              actions.deleteEdge(props.id);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 28}px)` }}
            title="Delete edge"
            aria-label="Delete edge"
            type="button"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
