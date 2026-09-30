"use client";

// What the window says the first time someone opens it.
//
// Before this, an empty conversation said "Nothing said yet" over a composer
// that could not be typed into, which teaches a person nothing except that
// something is broken. This is the one screen that has to explain what the
// channel is for, because it is the screen everyone sees first and most people
// see only once.
//
// It is deliberately concrete and short: the three journeys that actually
// arrive in a thread, one line each, and an invitation to write. It sits in
// the middle of the empty window, the way a chat greets you, rather than as a
// page of prose the composer has to push past.

import { KeyRound, MessagesSquare, PenLine, Split } from "lucide-react";

const ARRIVALS = [
  {
    id: "permission",
    icon: KeyRound,
    title: "Permission before anything lasting",
    body: "Before a step sends, publishes, pays or deletes something, FluxIQ stops here and asks. Everything else it just does."
  },
  {
    id: "choice",
    icon: Split,
    title: "A decision only you can make",
    body: "When an instruction can be read two ways, it shows both here and carries on with the one you pick."
  },
  {
    id: "report",
    icon: PenLine,
    title: "What it did, and what changed",
    body: "Progress while it works, and any repair it proposes when a site changes, with the change attached."
  }
] as const;

export function ConversationOpeningMessage() {
  return (
    <section aria-label="About this conversation" className="automation-conversation-opening">
      <header>
        <span aria-hidden className="automation-conversation-opening-mark"><MessagesSquare size={20} /></span>
        <h3>This is where FluxIQ talks to you</h3>
        <p>You can write here too. Tell it what you want in your own words, or correct something it got wrong.</p>
      </header>
      <ul>
        {ARRIVALS.map((arrival) => {
          const Icon = arrival.icon;
          return (
            <li key={arrival.id}>
              <Icon aria-hidden size={15} />
              <div>
                <strong>{arrival.title}</strong>
                <span>{arrival.body}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
