import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentFluxIQUser } from "../../lib/auth";
import { getFluxIQ } from "../../lib/fluxiq";
import { GetStartedClient } from "./GetStartedClient";
import { LoginPanel } from "../AuthShell";
import { resolveSetupDomain } from "./resolve-setup-domain";
import { SetupDomainChoice } from "./SetupDomainChoice";

/**
 * First-run setup: start the runtime, pair the browser extension, add a
 * DeepSeek key. Signed-in only, like every program page. Setup always runs in
 * an installed domain when there is one (`resolve-setup-domain.ts`): its start
 * buttons create Studio projects, and a project created without a domain is
 * refused by a browser paired for that domain. The domain travels in the URL
 * because the live sources and the start buttons read it from there. The
 * Suspense boundary is required because those sources read the query string
 * (`useProgramApi` calls `useSearchParams`).
 */
export default async function GetStartedPage(context: { searchParams: Promise<{ domainId?: string | string[] }> }) {
  if (!await currentFluxIQUser()) return <LoginPanel />;
  const query = await context.searchParams;
  const fluxiq = getFluxIQ();
  const setup = resolveSetupDomain({
    requestedDomainId: typeof query.domainId === "string" ? query.domainId : null,
    activeDomainId: fluxiq.activeDomainId,
    domains: fluxiq.domains.summaries()
  });
  if (setup.kind === "scoped" && setup.redirect) redirect(`/get-started?${new URLSearchParams({ domainId: setup.domainId })}`);
  if (setup.kind === "choose") return <SetupDomainChoice domains={setup.domains} />;
  return <Suspense fallback={null}><GetStartedClient /></Suspense>;
}
