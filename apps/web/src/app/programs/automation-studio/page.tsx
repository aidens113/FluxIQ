import { defaultGlobalProgramCatalog } from "fluxiq";
import { redirect } from "next/navigation";
import { currentFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";
import { ProgramWorkspace } from "../[programId]/ProgramWorkspace";
import { LoginPanel } from "../../AuthShell";
import { resolveSetupDomain } from "../../../lib/resolve-setup-domain";
import { StudioDomainChoice } from "./StudioDomainChoice";
import { studioHref } from "./studio-href";

type AutomationStudioPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Every Studio entry ends here: Home's plain launcher link and the
 * domain-scoped route (which redirects here with `?domainId=`). The client
 * reads the domain from this URL, and a project is stamped with it when it is
 * created, so a domain-less link while a domain is installed would create a
 * project that a client paired for that domain refuses. The domain is
 * therefore resolved here with first-run setup's rules: a requested installed
 * domain is kept; otherwise the active domain, then the only installed one, is
 * carried by redirect; with several and none active the person chooses; with
 * none installed Studio stays global.
 */
export default async function AutomationStudioPage(context: AutomationStudioPageProps) {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;

  const query = await context.searchParams;
  const fluxiq = getFluxIQ();
  const scope = resolveSetupDomain({
    requestedDomainId: typeof query.domainId === "string" ? query.domainId : null,
    activeDomainId: fluxiq.activeDomainId,
    domains: fluxiq.domains.summaries()
  });
  if (scope.kind === "scoped" && scope.redirect) redirect(studioHref(scope.domainId, query));
  if (scope.kind === "choose") return <StudioDomainChoice domains={scope.domains} query={query} />;
  const domain = scope.kind === "scoped" ? fluxiq.programDirectory(scope.domainId).domain : null;
  const domainId = domain?.id ?? null;
  const program = defaultGlobalProgramCatalog(domainId ? { domainId } : {}).find((item) => item.id === "automation-studio");
  if (!program) redirect("/");

  return <ProgramWorkspace
    backHref={domainId ? `/domains/${domainId}` : "/"}
    backLabel={domain?.title ?? "Global workspace"}
    capabilities={{
      api: ["snapshot"],
      storage: ["Recording sessions", "Normalized timelines", "Signal registries", "Learned task models", "Policy graphs"],
      runtime: ["Canonical repositories", "Fixture snapshot", "Policy inspection"]
    }}
    domainName={domain?.title ?? "Global"}
    program={program}
    user={{
      id: auth.user.id,
      displayName: auth.user.displayName,
      roleId: auth.user.roleId,
      totpEnabled: auth.user.totpEnabled,
      pinConfigured: auth.user.pinConfigured
    }}
  />;
}
