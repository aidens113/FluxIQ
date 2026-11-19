import { notFound } from "next/navigation";
import { commerceConfig } from "../../server/commerce";
import { AccountLinkFrame } from "../welcome/client";
import { PlansClient } from "./client";
import "./plans.css";

export const metadata = { title: "FluxIQ plans", referrer: "no-referrer" };
// The commerce configuration is read on every request, never baked in at build time.
export const dynamic = "force-dynamic";

/**
 * The hosted plans: a signed-in person chooses one, pays through Checkout and
 * returns here (`?checkout=success` or `?checkout=cancel`). Not found where
 * the server bills nothing, so local and self-hosted panels have no such page.
 */
export default function PlansPage() {
  if (commerceConfig() === null) notFound();
  return <AccountLinkFrame title="Choose a plan"><PlansClient /></AccountLinkFrame>;
}
