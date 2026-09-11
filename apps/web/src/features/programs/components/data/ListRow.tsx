"use client";

import type { ReactNode } from "react";

export function ListRow(props: {
  title: string;
  description?: string;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  onOpen(): void;
}) {
  return (
    <div className={`list-row${props.selected ? " selected" : ""}`} role="listitem">
      <button aria-current={props.selected ? "true" : undefined} className="list-row-main" onClick={props.onOpen} type="button">
        {props.leading ? <span className="list-row-leading" aria-hidden>{props.leading}</span> : null}
        <span className="list-row-copy"><strong title={props.title}>{props.title}</strong>{props.description ? <small title={props.description}>{props.description}</small> : null}</span>
        {props.meta ? <span className="list-row-meta">{props.meta}</span> : null}
      </button>
      {props.actions ? <div className="list-row-actions">{props.actions}</div> : null}
    </div>
  );
}
