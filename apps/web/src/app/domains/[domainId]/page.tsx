import { defaultGlobalProgramCatalog } from "fluxiq";
import { notFound } from "next/navigation";
import { GlobalTopbar, LoginPanel } from "../../AuthShell";
import { ProgramLauncher } from "../../ProgramLauncher";
import { currentFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";

export default async function DomainPage({ params }: { params: Promise<{ domainId: string }> }) {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  const { domainId } = await params;
  const domain = getFluxIQ().programDirectory(domainId).domain;
  if (!domain) notFound();
  const programs = defaultGlobalProgramCatalog({ domainId: domain.id });

  return (
    <main className="directory-page">
      <GlobalTopbar breadcrumbs={[{ label: "Programs", href: "/" }, { label: domain.title }]} user={auth.user} />
      <div className="directory-container">
        <header className="directory-heading">
          <p className="page-kicker">Domain</p>
          <h1 className="page-title">{domain.title}</h1>
          <p className="page-copy">{domain.description}</p>
        </header>
        <ProgramLauncher label={`${domain.title} programs`} programs={programs} />
      </div>
    </main>
  );
}