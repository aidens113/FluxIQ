/**
 * Where work from the chat is tried, as a person would name it in a sentence:
 * the site's name, which is its host without a leading `www.`
 * (`https://www.amazon.com/s?k=x` is "amazon.com"). An address never reaches
 * the thread: the live chat read "explored http://127.0.0.1:NNNN/scenarios/..."
 * (UI D9, run `run-musp8nz1-dbd3905a`), and a query or fragment is where a page
 * keeps a search, a session or a token. A page served from this machine or an
 * IP address has no name a person would recognise, nor does anything that is
 * not an http or https address, so it is "the page you had open"; with no page
 * at all it is "the website".
 *
 * `commands/page.ts` keeps the origin and path for the model and the handler,
 * which need to know which page it is; this is only for what the thread says.
 */
export function automationStudioConversationSiteName(address: string | undefined | null): string {
  if (!address) return "the website";
  let parsed: URL;
  try {
    parsed = new URL(address);
  } catch (error) {
    if (error instanceof TypeError) return "the page you had open";
    throw error;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "the page you had open";
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  const local = host === "localhost" || host.endsWith(".localhost");
  // An IPv6 literal keeps its brackets in `hostname`; an IPv4 one is four numbers.
  const ip = host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/u.test(host);
  if (!host || local || ip) return "the page you had open";
  return host.replace(/^www\./u, "");
}
