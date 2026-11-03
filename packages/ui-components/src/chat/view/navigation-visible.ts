/** True when `element` is on screen: connected, not inside anything hidden or inert, and laid out. */
export function navigationVisible(element: HTMLElement): boolean {
  return element.isConnected && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0;
}
