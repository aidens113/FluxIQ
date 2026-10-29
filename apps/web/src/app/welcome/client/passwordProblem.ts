const MINIMUM_PASSWORD_LENGTH = 12;

/** What is wrong with a new password and its confirmation, or null. The service enforces the same length. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if ([...password].length < MINIMUM_PASSWORD_LENGTH) return `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  if (password !== confirmation) return "The two passwords do not match.";
  return null;
}
