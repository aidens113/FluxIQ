import { defaultGlobalProgramCatalog } from "fluxiq";
import { redirect } from "next/navigation";
import { currentFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";
import { ProgramWorkspace } from "../[programId]/ProgramWorkspace";

type AutomationStudioPageProps = {
  searchParams: Promise<{ domainId?: string | string[] }>;
};

export default async function AutomationStudioPage(context: AutomationStudioPageProps) {
  const auth = await currentFluxIQUser();
  if (!auth) redirect("/");

  const query = await context.searchParams;
  const requestedDomainId = typeof query.domainId === "string" ? query.domainId : null;
  const domain = requestedDomainId ? getFluxIQ().programDirectory(requestedDomainId).domain : null;
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
