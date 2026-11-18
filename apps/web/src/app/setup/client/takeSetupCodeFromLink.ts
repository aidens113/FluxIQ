type LinkWindow = { location: { pathname: string; search: string; hash: string }; history: { replaceState(data: unknown, unused: string, url: string): void } };

/**
 * The setup code the printed link carries after `#`, which a browser never
 * sends to the server. Once read it is taken out of the address bar (and so
 * out of history and bookmarks); the page holds it only in memory and posts
 * it in a request body. Empty when the link carried none. The code is hex, so
 * it is read as written.
 */
export function takeSetupCodeFromLink(view: LinkWindow): string {
  const raw = view.location.hash.startsWith("#") ? view.location.hash.slice(1) : view.location.hash;
  if (raw !== "") view.history.replaceState(null, "", view.location.pathname + view.location.search);
  return raw.trim();
}
