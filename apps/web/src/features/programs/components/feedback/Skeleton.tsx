"use client";

export function Skeleton(props: { lines?: number; label?: string }) {
  const lines = Math.max(1, Math.min(12, props.lines ?? 3));
  return (
    <div aria-label={props.label ?? "Loading content"} aria-busy="true" className="skeleton" role="status">
      {Array.from({ length: lines }, (_, index) => <span aria-hidden key={index} style={{ width: `${index === lines - 1 ? 62 : 100}%` }} />)}
    </div>
  );
}
