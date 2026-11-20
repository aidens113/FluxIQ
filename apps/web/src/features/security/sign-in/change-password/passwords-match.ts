/** The sentence for a new password that does not match its repeat, or null when they match or the repeat is not typed yet. */
export function passwordMismatch(next: string, repeat: string): string | null {
  return repeat !== "" && next !== repeat ? "The new passwords do not match." : null;
}
