// The message of an unknown thrown value, with a fallback. Shared by the
// service facade and its collaborators.
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
