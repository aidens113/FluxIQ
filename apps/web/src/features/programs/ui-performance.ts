"use client";

import { useEffect, useRef } from "react";
import { evaluateRenderBudget } from "./ui-performance-budgets";

export type UiRenderMetric = {
  component: string;
  count: number;
  recordedAt: number;
};

export function useUiRenderMetric(component: string): void {
  const renderCount = useRef(0);
  renderCount.current += 1;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const detail = { component, count: renderCount.current, recordedAt: performance.now() };
    window.dispatchEvent(new CustomEvent<UiRenderMetric>("ui-render:metric", { detail }));
    for (const violation of evaluateRenderBudget(detail)) {
      window.dispatchEvent(new CustomEvent("ui-performance:budget-violation", { detail: violation }));
    }
  });
}
