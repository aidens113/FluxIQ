import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentFluxIQUser } from "../../lib/auth";
import { getFluxIQ } from "../../lib/fluxiq";
import { GetStartedClient } from "./GetStartedClient";
import { GetStartedFrame } from "./GetStartedFrame";
import { LoginPanel } from "../AuthShell";
import { resolveSetupDomain } from "../../lib/resolve-setup-domain";
import { SetupDomainChoice } from "./SetupDomainChoice";

/**
 * First-run setup: start the runtime, pair the browser extension, add a
 * DeepSeek key. Signed-in only, like every program page. Setup always runs in
 * an installed domain when there is one (`lib/resolve-setup-domain.ts`, shared with the Studio route): its start
 * buttons create Studio projects, and a project created without a domain is
 * refused by a browser paired for that domain. The domain travels in the URL
 * because the live sources and the start buttons read it from there. The
 * Suspense boundary is required because those sources read the query string
 * (`useProgramApi` calls `useSearchParams`). Every screen is framed by
 * `GetStartedFrame`, and `layout.tsx` loads the route's stylesheet.
 */
export default async function GetStartedPage(context: { searchParams: Promise<{ domainId?: string | string[] }> }) {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  const query = await context.searchParams;
  const fluxiq = getFluxIQ();
  const setup = resolveSetupDomain({
    requestedDomainId: typeof query.domainId === "string" ? query.domainId : null,
    activeDomainId: fluxiq.activeDomainId,
    domains: fluxiq.domains.summaries()
  });
  if (setup.kind === "scoped" && setup.redirect) redirect(`/get-started?${new URLSearchParams({ domainId: setup.domainId })}`);
  if (setup.kind === "choose") return <SetupDomainChoice domains={setup.domains} user={auth.user} />;
  return <GetStartedFrame copy="Start the runtime, pair the browser extension and add a DeepSeek key, then start your first automation." title="Set up FluxIQ" user={auth.user}>
    <Suspense fallback={null}><GetStartedClient /></Suspense>
  </GetStartedFrame>;
}
