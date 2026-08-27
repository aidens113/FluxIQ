import { defaultGlobalProgramCatalog } from "fluxiq";
import { GlobalTopbar, LoginPanel } from "./AuthShell";
import { ProgramLauncher, type LaunchDomain } from "./ProgramLauncher";
import { currentFluxIQUser } from "../lib/auth";
import { getFluxIQ } from "../lib/fluxiq";

export default async function HomePage() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  const domains = getFluxIQ().domains.summaries() as LaunchDomain[];
  const programs = defaultGlobalProgramCatalog();

  return (
    <main className="directory-page">
      <GlobalTopbar user={auth.user} />
      <div className="directory-container">
        <header className="directory-heading">
          <p className="page-kicker">Workspace</p>
          <h1 className="page-title">Programs</h1>
          <p className="page-copy">Open an automation workspace or framework service.</p>
        </header>
        <ProgramLauncher domains={domains} label="FluxIQ programs and domains" programs={programs} />
      </div>
    </main>
  );
}