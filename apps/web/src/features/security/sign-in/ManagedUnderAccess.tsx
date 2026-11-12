/**
 * Said in place of a person's sign-in name, role and sign-in on/off controls
 * when they have an account (`authorityHeldElsewhere`): those three are set by
 * provisioning, and `update-user` refuses them here, so the page links to the
 * Access section, where they are changed.
 */
export function ManagedUnderAccess() {
  return <a className="security-note" href="/security#security-access">Managed under Access</a>;
}
