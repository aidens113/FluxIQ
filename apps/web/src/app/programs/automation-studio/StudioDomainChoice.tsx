import type { SetupDomain } from "../../../lib/resolve-setup-domain";
import { studioHref } from "./studio-href";

/**
 * Shown when Studio is opened without a domain while several domains are
 * installed and the runtime names none: every project created in Studio
 * belongs to the domain in its link, so the person picks one rather than
 * Studio guessing. The rest of the link (project, flow, view) is kept.
 */
export function StudioDomainChoice(props: { domains: SetupDomain[]; query: Record<string, string | string[] | undefined> }) {
  return <main className="directory-page">
    <div className="directory-container">
      <header className="directory-heading">
        <p className="page-kicker">Automation Studio</p>
        <h1 className="page-title">Choose a domain</h1>
        <p className="page-copy">Each automation project belongs to one domain. Choose the one to work in.</p>
      </header>
      <ul aria-label="Installed domains">
        {props.domains.map((domain) => <li key={domain.id}>
          <a className="button button-secondary" href={studioHref(domain.id, props.query)}>{domain.title}</a>
          <p className="page-copy">{domain.description}</p>
        </li>)}
      </ul>
    </div>
  </main>;
}
