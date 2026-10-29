import { AccountLinkFrame } from "./client";
import { WelcomeClient } from "./WelcomeClient";

export const metadata = { title: "Welcome to FluxIQ", referrer: "no-referrer" };

/** The emailed welcome link lands here: it verifies the email, sets the password and signs the person in. */
export default function WelcomePage() {
  return <AccountLinkFrame title="Welcome to FluxIQ"><WelcomeClient /></AccountLinkFrame>;
}
