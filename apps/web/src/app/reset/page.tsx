import { AccountLinkFrame } from "../welcome/client";
import { ResetClient } from "./ResetClient";

export const metadata = { title: "Reset your FluxIQ password", referrer: "no-referrer" };

/** Asks for a password-reset link, and sets the new password when opened from one. */
export default function ResetPage() {
  return <AccountLinkFrame title="Reset your password"><ResetClient /></AccountLinkFrame>;
}
