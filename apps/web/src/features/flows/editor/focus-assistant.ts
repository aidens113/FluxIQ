/**
 * Brings the assistant dock forward and puts the cursor in its message box, after the page has
 * published the Flow and the picked steps (the dock sends them with every message). The dock has
 * no "open" call of its own yet (panel-shell's `AssistantDock` keeps it in local state), so this
 * presses its own round button on a phone, where the dock is a closed sheet, and focuses what the
 * dock holds. Returns false when there is no dock on the page.
 */
export function focusAssistant(document: Document): boolean {
  const dock = document.querySelector<HTMLElement>("aside[aria-label='Assistant']");
  if (!dock) return false;
  const opener = document.querySelector<HTMLButtonElement>("button[aria-label='Open the assistant']");
  if (opener && opener.getAttribute("aria-expanded") === "false" && opener.offsetParent !== null) opener.click();
  const focus = () => {
    const box = dock.querySelector<HTMLElement>("textarea, [contenteditable='true'], input[type='text']");
    (box ?? dock).focus();
  };
  // The sheet becomes visible on the next frame once the button has opened it.
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
  else focus();
  return true;
}
