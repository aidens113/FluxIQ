import { GetStartedFrame, type GetStartedFrameProps } from "./GetStartedFrame";
import type { SetupDomain } from "../../lib/resolve-setup-domain";

/**
 * Shown by first-run setup when several domains are installed and the runtime
 * names none: each project belongs to one domain, so the person picks which
 * one this setup is for before starting.
 */
export function SetupDomainChoice(props: { domains: SetupDomain[]; user: GetStartedFrameProps["user"] }) {
  return <GetStartedFrame copy="Each automation project belongs to one domain. Choose the one you want to set up." title="Choose a domain" user={props.user}>
    <ul aria-label="Installed domains" className="get-started-domains">
      {props.domains.map((domain) => <li key={domain.id}>
        <a className="button button-secondary" href={`/get-started?${new URLSearchParams({ domainId: domain.id })}`}>{domain.title}</a>
        <p className="page-copy">{domain.description}</p>
      </li>)}
    </ul>
  </GetStartedFrame>;
}
