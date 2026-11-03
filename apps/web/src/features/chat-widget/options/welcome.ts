// What the empty chat says the first time someone opens it.
//
// An empty conversation that says nothing, over a box that cannot be typed
// into, teaches a person only that something is broken. This is the one screen
// that has to explain what the channel is for, because everyone sees it first
// and most see it once. It is concrete and short: the three journeys that
// actually arrive in a thread, one line each, and an invitation to write.

import type { ChatWelcome } from "@fluxiq/ui-components";

export const PANEL_CHAT_WELCOME: ChatWelcome = {
  title: "This is where FluxIQ talks to you",
  line: "You can write here too. Tell it what you want in your own words, or correct something it got wrong.",
  items: [
    {
      icon: "key-round",
      title: "Permission before anything lasting",
      body: "Before a step sends, publishes, pays or deletes something, FluxIQ stops here and asks. Everything else it just does."
    },
    {
      icon: "split",
      title: "A decision only you can make",
      body: "When an instruction can be read two ways, it shows both here and carries on with the one you pick."
    },
    {
      icon: "pen-line",
      title: "What it did, and what changed",
      body: "Progress while it works, and any repair it proposes when a site changes, with the change attached."
    }
  ]
};
