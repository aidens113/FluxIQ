import { FLUXIQ_CONNECT_PATHS, parseConnectDoneFragment } from "fluxiq/platform/profile";

export type ConnectHandoffStatus = "ready" | "declined" | "failed" | "invalid";

/** The extension observes its own tab URL and verifies its own state. This page never exposes the code to a message channel. */
export function describeConnectHandoff(href: string, expectedOrigin: string): ConnectHandoffStatus {
  try {
    const url = new URL(href);
    if (url.origin !== expectedOrigin || url.pathname !== FLUXIQ_CONNECT_PATHS.done || url.search !== "" || url.username || url.password) return "invalid";
    const fragment = parseConnectDoneFragment(url.hash);
    if (!fragment) return "invalid";
    if (fragment.kind === "code") return "ready";
    return fragment.error === "access_denied" ? "declined" : "failed";
  } catch {
    return "invalid";
  }
}
