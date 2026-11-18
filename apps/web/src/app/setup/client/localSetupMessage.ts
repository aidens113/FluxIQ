/** The sentence shown for a refusal of the local setup page. One sentence for a wrong code, whatever was typed. */
export function localSetupMessage(code: string, retryAfterMs?: number): string {
  switch (code) {
    case "invalid_code": return "That setup link is not right. Open the newest link printed in the window that started FluxIQ.";
    case "setup_expired": return "That setup link has expired. Restart FluxIQ and open the new link it prints.";
    case "setup_unavailable": return "This setup link is no longer valid. Restart FluxIQ and open the new link it prints.";
    case "rate_limited": return `Too many wrong setup links. Try again in ${Math.max(1, Math.ceil((retryAfterMs ?? 60_000) / 60_000))} minute(s).`;
    case "setup_on_this_computer": return "Finish setup on the computer running FluxIQ, at http://127.0.0.1.";
    case "password_mismatch": return "The two passwords do not match.";
    case "weak_password": return "Use at least 12 characters, and not the word admin.";
    case "invalid_input": return "Choose a name without spaces, at most 64 characters.";
    case "username_taken": return "That name is already used by another account. Choose another.";
    case "not_found": return "FluxIQ already has an owner. Sign in instead.";
    case "sign_in_failed": return "Your account is set up, but we could not sign you in. Sign in with your new password.";
    case "unreachable": return "FluxIQ could not be reached. Try again.";
    default: return "That did not work. Try again.";
  }
}
