/** True while the tab is in the background, when nothing it polls can be seen. */
export function tabIsHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
