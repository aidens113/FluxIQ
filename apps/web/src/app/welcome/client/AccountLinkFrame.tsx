import type { ReactNode } from "react";
import "./account-link.css";

/** The plain page frame the welcome and reset pages share: no signed-in chrome, since the visitor is not signed in. */
export function AccountLinkFrame(props: { title: string; children: ReactNode }) {
  return <main className="account-link-page">
    <div className="account-link-card">
      <p className="account-link-brand">FluxIQ</p>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  </main>;
}
