"use client";

import { LoaderCircle } from "lucide-react";

export function LoadingState(props: { label: string; detail?: string; compact?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className={`loading-state${props.compact ? " compact" : ""}`} role="status">
      <LoaderCircle aria-hidden className="spin" size={props.compact ? 15 : 20} />
      <span><strong>{props.label}</strong>{props.detail ? <small>{props.detail}</small> : null}</span>
    </div>
  );
}
