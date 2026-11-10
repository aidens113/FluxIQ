"use client";

import { formatSpend } from "./format-spend";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useEngineStatus } from "./use-engine-status";

export type TopBarProps = {
  /** Today's spend in dollars. Absent until a source for it exists: the bar shows "—", never a guess. */
  spendTodayUsd?: number | null;
};

export function TopBar(props: TopBarProps) {
  const engine = useEngineStatus();
  return (
    <header className="panel-topbar">
      <span className="panel-brand">FluxIQ</span>
      <ProjectSwitcher />
      <div className="panel-topbar-facts">
        <span className="panel-engine" data-tone={engine.tone} role="status" aria-label={`Engine: ${engine.label}`}>
          <span className="panel-engine-dot" aria-hidden="true" />
          Engine: {engine.label}
        </span>
        <span className="panel-spend" aria-label={`Spent today: ${formatSpend(props.spendTodayUsd)}`}>
          Today: {formatSpend(props.spendTodayUsd)}
        </span>
      </div>
    </header>
  );
}
