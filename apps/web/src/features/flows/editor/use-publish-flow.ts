"use client";

import { useEffect, useRef } from "react";
import { usePanelContext } from "../../panel-shell";
import type { StepView } from "../model";

/**
 * Tells the panel which Flow is open and which steps are picked, so "change this" in the assistant
 * means this Flow. The Flow's project becomes the panel's project when the Flow opens. The panel's
 * step numbers are whole numbers, so a nested step ("5.1") is named by its node only.
 */
export function usePublishFlow(flow: { projectId: string; flowId: string }, views: readonly StepView[], selected: ReadonlySet<string>): void {
  const { context, dispatch } = usePanelContext();
  const projectAtOpen = useRef(context.projectId);
  useEffect(() => {
    if (projectAtOpen.current !== flow.projectId) dispatch({ type: "project", projectId: flow.projectId });
  }, [dispatch, flow.projectId]);
  const picked = pickedSteps(views, selected);
  const key = JSON.stringify(picked);
  useEffect(() => {
    const { stepNumbers, nodeIds } = JSON.parse(key) as { stepNumbers: number[]; nodeIds: string[] };
    dispatch({ type: "publish", page: "flows", selection: { flowId: flow.flowId, stepNumbers, nodeIds } });
  }, [dispatch, flow.flowId, key]);
}

function pickedSteps(views: readonly StepView[], selected: ReadonlySet<string>): { stepNumbers: number[]; nodeIds: string[] } {
  const stepNumbers: number[] = [];
  const nodeIds: string[] = [];
  const walk = (steps: readonly StepView[]) => {
    for (const step of steps) {
      if (selected.has(step.key)) {
        if (/^\d+$/u.test(step.number)) stepNumbers.push(Number(step.number));
        const node = step.nodeIds[0];
        if (node) nodeIds.push(node);
      }
      walk(step.children);
      for (const arm of step.arms) walk(arm.steps);
    }
  };
  walk(views);
  return { stepNumbers, nodeIds };
}
