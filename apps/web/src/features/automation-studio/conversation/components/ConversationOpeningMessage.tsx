"use client";

// What the window says the first time someone opens it.
//
// Before this, an empty conversation said "Nothing said yet" over a composer
// that could not be typed into, which teaches a person nothing except that
// something is broken. This is the one screen that has to explain what the
// channel is for, because it is the screen everyone sees first and most people
// see only once.
//
// It is deliberately concrete. "FluxIQ will talk to you here" is a slogan; the
// three things below are the three journeys that actually arrive in a thread,
// named in the words the product uses for them elsewhere.

import { KeyRound, MessagesSquare, PenLine, Split } from "lucide-react";

const ARRIVALS = [
  {
    id: "permission",
    icon: KeyRound,
    title: "Permission before anything lasting",
    body: "FluxIQ does what you asked without checking first. When the next step would send, publish, pay, edit or delete something, it stops here, tells you exactly what the step would do, and waits for you rather than giving up."
  },
  {
    id: "choice",
    icon: Split,
    title: "A decision only you can make",
    body: "When an instruction can be read two ways -- which listings count as recent, which of two buttons is the one you meant -- it puts both readings here and carries on with the one you pick."
  },
  {
    id: "report",
    icon: PenLine,
    title: "What it did, and what changed",
    body: "Progress while a run works, and a proposed repair when a site changes under a Flow, arrive here with the change itself attached, so you can read it before it is applied."
  }
] as const;

export function ConversationOpeningMessage() {
  return (
    <section aria-label="About this conversation" className="automation-conversation-opening">
      <header>
        <MessagesSquare aria-hidden size={18} />
        <h3>This is where FluxIQ talks to you</h3>
      </header>
      <p>
        One place for everything FluxIQ needs from you while it works, instead of a separate screen
        for each kind of question.
      </p>
      <ul>
        {ARRIVALS.map((arrival) => {
          const Icon = arrival.icon;
          return (
            <li key={arrival.id}>
              <Icon aria-hidden size={14} />
              <div>
                <strong>{arrival.title}</strong>
                <span>{arrival.body}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="automation-conversation-opening-reply">
        You can write here too. Tell it what you actually wanted, correct something it got wrong, or
        answer a question in your own words -- it reads the thread before its next move.
      </p>
      <p className="automation-conversation-opening-empty">
        Nothing has been said yet. A thread opens by itself the moment a run, a build or a Flow has
        something to tell you.
      </p>
    </section>
  );
}
