import { CONNECT_AUTHORIZE_FIELDS, type ConnectConsentView } from "../model";

export function ConnectConsent({ view }: { view: Extract<ConnectConsentView, { kind: "consent" }> }) {
  return <>
    <p><strong>{view.request.client_label}</strong> can run your automations in this browser.</p>
    <p>Connect as {view.user.displayName} ({view.user.email}) in <strong>{view.workspace.name}</strong>.</p>
    <form action="/api/connect/authorize" method="post">
      {CONNECT_AUTHORIZE_FIELDS.map((field) => <input key={field} name={field} type="hidden" value={view.request[field]} />)}
      <input name="consent_evidence" type="hidden" value={view.evidence} />
      <div className="button-row">
        <button className="button button-primary" name="decision" type="submit" value="approve">Connect browser</button>
        <button className="button" name="decision" type="submit" value="deny">Cancel</button>
      </div>
    </form>
  </>;
}
