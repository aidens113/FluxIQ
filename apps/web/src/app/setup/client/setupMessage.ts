/** The sentence shown for a setup refusal code. One sentence for a wrong code, whatever was typed. */
export function setupMessage(code: string, retryAfterMs?: number): string {
  switch (code) {
    case "invalid_code": return "That setup code is not right. Copy it from the setup-code file named in the server's start-up log.";
    case "rate_limited": return `Too many wrong setup codes. Try again in ${Math.max(1, Math.ceil((retryAfterMs ?? 60_000) / 60_000))} minute(s).`;
    case "setup_unavailable": return "This server has no setup code. Restart it and read the setup-code file named in its start-up log.";
    case "password_mismatch": return "The two passwords do not match.";
    case "weak_password": return "Use at least 12 characters.";
    case "invalid_input": return "Check the highlighted fields. The username is your email address.";
    case "username_taken": return "An account with that email already exists. Choose another.";
    case "claim_incomplete": return "An earlier setup attempt was interrupted. Enter the same email and display name as then.";
    case "not_found": return "This server already has an owner. Sign in instead.";
    case "sign_in_failed": return "Your owner account is set up, but we could not sign you in. Sign in with your new password.";
    case "unreachable": return "FluxIQ could not be reached. Try again.";
    default: return "That did not work. Try again.";
  }
}
