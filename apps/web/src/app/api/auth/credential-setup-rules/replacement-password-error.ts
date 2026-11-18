const TEMPORARY_PASSWORD = "admin";
const MINIMUM_LENGTH = 12;

/** Why a replacement for the temporary password is refused, or "" when it is accepted: the same rule on the form and on the server. */
export function replacementPasswordError(password: string, confirmation: string): string {
  if (password.length < MINIMUM_LENGTH) return `Use at least ${MINIMUM_LENGTH} characters.`;
  if (password.toLowerCase() === TEMPORARY_PASSWORD) return "Choose a password other than the temporary password.";
  if (password !== confirmation) return "Passwords do not match.";
  return "";
}
