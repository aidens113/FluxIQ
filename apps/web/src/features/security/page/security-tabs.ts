/** The four places under Security, in the order the tab bar lists them. */
export type SecurityTabId = "sign-in" | "devices" | "people" | "activity";

export const SECURITY_TABS: ReadonlyArray<{ id: SecurityTabId; label: string; href: string }> = [
  { id: "sign-in", label: "Your sign-in", href: "/security/sign-in" },
  { id: "devices", label: "Devices and apps", href: "/security/devices" },
  { id: "people", label: "People", href: "/security/people" },
  { id: "activity", label: "Activity", href: "/security/activity" }
];
