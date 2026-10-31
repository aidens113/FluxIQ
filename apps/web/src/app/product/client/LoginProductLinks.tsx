"use client";

import { usePanelBranding } from "./usePanelBranding";

const FOOTER = [["terms", "Terms"], ["privacy", "Privacy"], ["support", "Support"]] as const;

/** A product's sign-up link and footer links under the sign-in form; nothing without a product that sets them. */
export function LoginProductLinks(props: { signUp: boolean }) {
  const { links, signUpUrl } = usePanelBranding();
  const footer = FOOTER.filter(([key]) => links[key]);
  const showSignUp = props.signUp && Boolean(signUpUrl);
  if (!showSignUp && footer.length === 0) return null;
  return (
    <div className="product-auth-links">
      {showSignUp ? <a href={signUpUrl ?? undefined} rel="noopener noreferrer">Create an account</a> : null}
      {footer.length ? (
        <nav aria-label="Product links">
          {footer.map(([key, label]) => <a href={links[key]} key={key} rel="noopener noreferrer" target="_blank">{label}</a>)}
        </nav>
      ) : null}
    </div>
  );
}
