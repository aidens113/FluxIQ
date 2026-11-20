"use client";

import { ConnectClientSection } from "../../settings-page/connect";
import { SecurityTabPage } from "./SecurityTabPage";

/** `/security/devices`: requests waiting to connect, the browsers and apps connected, and how to connect another. */
export function SecurityDevicesPage() {
  return (
    <SecurityTabPage active="devices">
      <ConnectClientSection />
    </SecurityTabPage>
  );
}
