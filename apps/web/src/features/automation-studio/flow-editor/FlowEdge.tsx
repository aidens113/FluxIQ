"use client";

import { Trash2 } from "lucide-react";
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { automationEdgeRoute, automationLaneEdgePath, automationLoopEdgePath } from "../graph/edge-routing";
import { useFlowEditorActions } from "./FlowEditorActionsContext";
export function FlowEdge(props: EdgeProps) {
  const actions = useFlowEditorActions();
  const route = automationEdgeRoute(props.id, props.sourceX, props.sourceY, props.targetX, props.targetY, props.data as Record<string, unknown> | undefined);
  const [edgePath, labelX, labelY] = route.kind === "loop"
    ? automationLoopEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane)
    : automationLaneEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane);
  const label = String(props.label ?? props.data?.label ?? "");
  const configuredWidth = typeof props.style?.strokeWidth === "number" ? props.style.strokeWidth : 4;
  const stroke = typeof props.style?.stroke === "string" && props.style.stroke ? props.style.stroke : "#2478bd";
  return (
    <>
      <path
        id={props.id + "-halo"}
        d={edgePath}
        className="react-flow__edge-path automation-flow-edge-halo"
        fill="none"
        strokeWidth={Math.max(8, configuredWidth + 5)}
        vectorEffect="non-scaling-stroke"
      />
      <path
        id={props.id}
        d={edgePath}
        className="react-flow__edge-path automation-flow-edge-path"
        style={{
          ...props.style,
          fill: "none",
          stroke,
          strokeWidth: props.selected ? Math.max(5, configuredWidth + 1) : Math.max(4, configuredWidth)
        }}
        vectorEffect="non-scaling-stroke"
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        vectorEffect="non-scaling-stroke"
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
          <span className={props.selected ? "automation-edge-label selected nodrag nopan" : "automation-edge-label nodrag nopan"} style={{ transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 10}px)` }}>{label}</span>
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
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 42}px)` }}
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
