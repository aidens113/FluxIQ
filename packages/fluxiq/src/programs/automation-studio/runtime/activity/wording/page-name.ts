import { automationStudioActivityHumanLabel } from "./human-label.ts";

/** The name of the page a Flow or a build starts on, when its address names no site. */
const START_PAGE = "the start page";
/** The page-start shorthand a page view writes an address in ("~/ip/napkins"); bare, it is the start page itself. */
const START_ITSELF = /^~\/?$/u;
/** A host a person would not recognise: this machine, or an IPv4 or bracketed IPv6 address. */
const UNNAMED_HOST = /^(localhost|.+\.localhost|\d{1,3}(\.\d{1,3}){3}|\[.*\])$/u;
/** A page file's ending, which is no part of the page's name. */
const PAGE_FILE = /\.(?:html?|php|aspx?|jsp)$/iu;
/** A path segment that is an id rather than a name: letters and digits run together ("B0DPN4ANC7"), or digits alone. */
const ID_SEGMENT = /^(?=.*\d)[A-Za-z0-9]{6,}$|^\d+$/u;
/** The most of a path's words a page's name keeps. */
const MAX_PATH_NAME = 40;

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

/** The words the last path segment that reads as a name says ("/scenarios/social-network-feed/friends/" is "friends"). */
function pathName(url: URL): string | undefined {
  const segments = url.pathname.split("/").filter(Boolean).reverse();
  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch (error) {
      if (error instanceof URIError) continue;
      throw error;
    }
    const bare = decoded.replace(PAGE_FILE, "");
    if (ID_SEGMENT.test(bare)) continue;
    const words = bare.replace(/[-_+.]+/gu, " ").trim();
    // Three letters at least: a two-letter segment ("dp", "s") is a route, not a name.
    if (!/\p{L}{3}/u.test(words)) continue;
    return automationStudioActivityHumanLabel(words, MAX_PATH_NAME);
  }
  return undefined;
}

/**
 * The page a navigate opens, in plain words: its site, which is the host
 * without a leading `www.` ("amazon.com"); for a page served from this
 * machine or an IP address, "the start page" only when it is the address the
 * Flow or the build starts at (`start`), else the words its path ends in
 * ("friends" for `/scenarios/social-network-feed/friends/`), else "the home
 * page" for the site's root; and "the start page" for the page-start shorthand
 * alone. Never a query or a whole address. Nothing for a value that is no web
 * address, or a path that names nothing, so the sentence says the verb alone.
 *
 * Every page served from this machine read "the start page": run D's build
 * opened `/friends/` as "Opening the start page" (U10, `run-muw6144a-e56f945d`).
 */
export function automationStudioActivityPageName(parameters: unknown, start?: string | undefined): string | undefined {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const url = (parameters as { url?: unknown }).url;
  if (typeof url !== "string") return undefined;
  const address = url.trim();
  if (START_ITSELF.test(address)) return START_PAGE;
  const page = parsed(address);
  const host = page?.hostname.toLowerCase().replace(/\.$/u, "");
  if (!page || !host) return undefined;
  if (!UNNAMED_HOST.test(host)) return host.replace(/^www\./u, "");
  if (start !== undefined && sameAddress(page, start)) return START_PAGE;
  return pathName(page) ?? (page.pathname.replace(/\/+$/u, "") === "" ? "the home page" : undefined);
}
