/** The sentence shown for a refusal code. One for every bad link, so a probe learns nothing. */
export function accountLinkMessage(code: string): string {
  switch (code) {
    case "invalid_link": return "This link is invalid or has expired. Resend it from the site you signed up on.";
    case "weak_password": return "Use at least 12 characters.";
    case "disabled": return "This account is disabled. Contact support.";
    case "two_factor": return "This account uses two-factor sign-in, so its password cannot be reset from an email link. Ask your administrator to reset it.";
    case "sign_in_failed": return "Your password is set, but we could not sign you in. Sign in with your new password.";
    case "unreachable": return "FluxIQ could not be reached. Try again.";
    default: return "That did not work. Try again.";
  }
}
