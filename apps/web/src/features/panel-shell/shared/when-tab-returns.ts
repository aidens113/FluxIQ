/** Runs `run` each time the person comes back to this tab (it becomes visible or the window gains focus). Returns the way to stop. */
export function whenTabReturns(run: () => void): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => undefined;
  const onVisibility = () => {
    if (document.visibilityState === "visible") run();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", run);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", run);
  };
}
