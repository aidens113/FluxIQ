"use client";

import type { ReactNode } from "react";
import { PublishPanelPage } from "../../panel-shell";
import "../security.css";

/** A page under Security: a way back, its name, one sentence of what it is for, and the page itself. */
export function SecuritySubPage(props: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="security">
      <PublishPanelPage page="security" selection={{}} />
      <a className="security-back" href="/security">Security</a>
      <h1>{props.title}</h1>
      <p className="security-note">{props.note}</p>
      {props.children}
    </div>
  );
}
