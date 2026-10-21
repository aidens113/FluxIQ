import { automationStudioActivityHumanLabel } from "./human-label.ts";

/** The name of the page a Flow or a build starts on, when its address names no site. */
const START_PAGE = "the start page";
/** The name of a page served from this machine that is neither the start nor the site's root, and whose title the call does not carry. */
const ANOTHER_PAGE = "another page";
/** The page-start shorthand a page view writes an address in ("~/ip/napkins"); bare, it is the start page itself. */
const START_ITSELF = /^~\/?$/u;
/** A host a person would not recognise: this machine, or an IPv4 or bracketed IPv6 address. */
const UNNAMED_HOST = /^(localhost|.+\.localhost|\d{1,3}(\.\d{1,3}){3}|\[.*\])$/u;
/** The most of a page's title a page's name keeps. */
const MAX_TITLE = 40;

function parsed(address: string): URL | undefined {
  if (!/^https?:\/\//iu.test(address) || /\s/u.test(address)) return undefined;
  try {
    return new URL(address);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

/** An address as two of them are compared: its origin and path, without a closing slash, a query or a fragment. */
function sameAddress(left: URL, right: string): boolean {
  const other = parsed(right.trim());
  const path = (url: URL): string => url.pathname.replace(/\/+$/u, "");
  return other !== undefined && left.origin === other.origin && path(left) === path(other);
}

/**
 * The page a navigate opens, in plain words: its site, which is the host
 * without a leading `www.` ("amazon.com"); for a page served from this
 * machine or an IP address, "the start page" only when it is the address the
 * Flow or the build starts at (`start`), else the page's title when the call
 * carries one (`title`), else "the home page" for the site's root, else
 * "another page"; and "the start page" for the page-start shorthand alone.
 * Never a query, a whole address or a word of its path. Nothing for a value
 * that is no web address, so the sentence says the verb alone.
 *
 * Every page served from this machine read "the start page": run D's build
 * opened `/friends/` as "Opening the start page" (U10, `run-muw6144a-e56f945d`).
 * Its path's words then named it, "Opening “my account”" (t753, round-5 UI
 * review): a path is the site's own spelling, not a name a person reads.
 */
export function automationStudioActivityPageName(parameters: unknown, start?: string | undefined): string | undefined {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const { url, title } = parameters as { url?: unknown; title?: unknown };
  if (typeof url !== "string") return undefined;
  const address = url.trim();
  if (START_ITSELF.test(address)) return START_PAGE;
  const page = parsed(address);
  const host = page?.hostname.toLowerCase().replace(/\.$/u, "");
  if (!page || !host) return undefined;
  if (!UNNAMED_HOST.test(host)) return host.replace(/^www\./u, "");
  if (start !== undefined && sameAddress(page, start)) return START_PAGE;
  const titled = automationStudioActivityHumanLabel(title, MAX_TITLE);
  if (titled) return titled;
  return page.pathname.replace(/\/+$/u, "") === "" ? "the home page" : ANOTHER_PAGE;
}
