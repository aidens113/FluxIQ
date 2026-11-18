/** The sentence for a refused sign-up, by the route's code. None of them says whether the address has an account. */
export function signupMessage(code: string): string {
  switch (code) {
    case "invalid_email": return "Enter a valid email address.";
    case "invalid_name": return "Enter a display name of at most 100 characters.";
    case "terms_changed": return "The terms have changed. Reload the page to read and accept them.";
    case "rate_limited": return "Too many sign-ups. Wait a few minutes and try again.";
    case "unreachable": return "FluxIQ could not be reached. Check your connection and try again.";
    default: return "That did not work. Try again.";
  }
}
