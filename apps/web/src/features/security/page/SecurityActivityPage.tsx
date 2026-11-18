"use client";

import { ActivitySection } from "../activity";
import { SecurityTabPage } from "./SecurityTabPage";

/** `/security/activity`: what was done in this FluxIQ, in plain sentences. */
export function SecurityActivityPage() {
  return (
    <SecurityTabPage active="activity">
      <ActivitySection />
    </SecurityTabPage>
  );
}
