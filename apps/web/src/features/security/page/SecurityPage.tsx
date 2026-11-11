"use client";

import { PublishPanelPage } from "../../panel-shell";
import { AccessSection } from "../access";
import { ActivitySection } from "../activity";
import { KeysSection } from "../keys";
import "../security.css";

/** Your keys, who can reach FluxIQ, and a log of what was done. */
export function SecurityPage() {
  return (
    <div className="security">
      <PublishPanelPage page="security" selection={{}} />
      <h1>Security</h1>
      <p className="security-note">Your keys, who can reach FluxIQ, and a log of what was done.</p>
      <KeysSection />
      <AccessSection />
      <ActivitySection />
    </div>
  );
}
