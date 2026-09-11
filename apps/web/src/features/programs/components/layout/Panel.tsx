"use client";

import type { ReactNode } from "react";

export function Panel(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel workspace-panel">
      <div className="panel-heading">
        <h2 className="panel-title">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}
