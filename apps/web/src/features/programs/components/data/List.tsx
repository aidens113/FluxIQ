"use client";

import type { ReactNode } from "react";

export function List(props: { label: string; children: ReactNode; loading?: boolean }) {
  return <div aria-busy={props.loading || undefined} aria-label={props.label} className="list" role="list">{props.children}</div>;
}
