/** A site as its host name: `https://shop.example/x` is `shop.example`; a value that is no address is left as it is. */
export function siteHost(site: string): string {
  try {
    return new URL(site).host.replace(/^www\./u, "") || site;
  } catch {
    return site;
  }
}
