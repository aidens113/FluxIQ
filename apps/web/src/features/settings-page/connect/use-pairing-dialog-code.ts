"use client";

import { useEffect, useState } from "react";

const CODE_SELECTOR = ".client-pairing-request-code";

function shownCode(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(CODE_SELECTOR)?.textContent?.trim() || null;
}

/**
 * The reference code of the request the pairing confirmation dialog is asking
 * about, or null while that dialog is closed. The dialog sits above the page
 * and hides the inline buttons, so the list shows that request as being
 * handled there instead of offering a second, covered way to answer it.
 */
export function usePairingDialogCode(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
    const update = () => setCode(shownCode());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return code;
}
