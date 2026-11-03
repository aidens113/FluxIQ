// Where focus goes when the control that held it is gone (the way back to the
// latest chat): into the composer when it can be typed in, otherwise onto the
// chat itself. Nothing moves if the window or tab is not the one the person is in.

import type { Composer } from "../conversation/index.ts";
import { navigationVisible } from "./navigation-visible.ts";

/** Moves focus into `composer` if its box is usable, else onto `chat`. */
export function handFocusOn(chat: HTMLElement, composer: Composer): void {
  if (!document.hasFocus() || document.visibilityState !== "visible" || !navigationVisible(chat)) return;
  const box = composer.element.querySelector<HTMLTextAreaElement>("#conversationInput");
  if (box && !box.disabled && navigationVisible(box)) {
    composer.focus();
  } else {
    chat.focus({ preventScroll: true });
  }
}
