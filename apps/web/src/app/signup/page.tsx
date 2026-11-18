import { notFound } from "next/navigation";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { AccountLinkFrame } from "../welcome/client";
import { SIGNUP_TERMS_VERSION } from "./server";
import { SignupClient } from "./SignupClient";

export const metadata = { title: "Sign up for FluxIQ", referrer: "no-referrer" };
// FLUXIQ_SIGNUP is read on every request, never baked in at build time.
export const dynamic = "force-dynamic";

/** Core's own sign-up page (the website links here): open only with `FLUXIQ_SIGNUP=open` on `service`, not found otherwise. */
export default function SignupPage() {
  if (resolveFluxIQDeploymentSettings(process.env).signup !== "open") notFound();
  return <AccountLinkFrame title="Create your FluxIQ account"><SignupClient termsVersion={SIGNUP_TERMS_VERSION} /></AccountLinkFrame>;
}
