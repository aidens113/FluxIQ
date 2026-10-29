/** The `token` in a URL fragment such as `#token=abc`, or null. */
export function readFragmentToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/u, "")).get("token");
  return token !== null && token !== "" ? token : null;
}
