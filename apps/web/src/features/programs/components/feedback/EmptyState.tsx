"use client";

import type { ReactNode } from "react";

export function EmptyState(props: { title: string; description: string; icon?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty-state${props.compact ? " compact" : ""}`}>
      {props.icon ? <span className="empty-state-icon" aria-hidden>{props.icon}</span> : null}
      <strong>{props.title}</strong>
      <p>{props.description}</p>
      {props.action ? <div className="empty-state-action">{props.action}</div> : null}
    </div>
  );
}
