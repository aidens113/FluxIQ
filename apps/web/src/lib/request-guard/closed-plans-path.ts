/**
 * True for the plan page while this server bills nothing: billing is on only
 * when `FLUXIQ_COMMERCE_CONFIG_FILE` names a file, the same rule the commerce
 * configuration reader applies (`server/commerce/config.ts`). The middleware
 * answers it 404 before rendering starts, because a page that calls
 * `notFound()` under the root loading boundary has already streamed a 200
 * shell. The checkout API answers its own JSON 404, so only the page matches.
 */
export function isClosedPlansPath(pathname: string, commerceConfigFile: string | undefined): boolean {
  if (commerceConfigFile !== undefined && commerceConfigFile.trim() !== "") return false;
  return (pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname) === "/plans";
}
