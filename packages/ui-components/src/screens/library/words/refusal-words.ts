import type { SubflowCard, SubflowLastingClass, SubflowRefusal } from "../types.ts";
import { joinWords } from "./join-words.ts";
import { lastingVerb } from "./lasting/index.ts";
import { siteHost } from "./site-host.ts";

/**
 * What a refusal says and what to do next. `ask` says the person can answer it here: "allow" offers a
 * one-press permission for the classes, "repeat" offers going ahead. A refusal always ends with nothing changed.
 */
export type RefusalWords = { says: string; next: string; ask?: "allow" | "repeat"; classes: SubflowLastingClass[] };

const NOTHING = "Nothing on the site changed.";

/** A refusal in words, with its next step. No code, id or version reaches the person. */
export function refusalWords(refusal: Pick<SubflowRefusal, "code" | "classes">, card?: SubflowCard): RefusalWords {
  const classes = refusal.classes ?? card?.lastingClasses ?? [];
  const does = joinWords(classes.map(lastingVerb));
  switch (refusal.code) {
    case "part.wrong_site": {
      const hosts = card === undefined ? [] : card.sites.map(siteHost);
      return {
        says: `This page is not on a site it works on. ${NOTHING}`,
        next: hosts.length > 0 ? `Open ${joinWords(hosts)} in this browser and try again.` : "Open the site it works on in this browser and try again.",
        classes
      };
    }
    case "part.not_at_start": {
      const needs = card?.startCheck?.says;
      return { says: `It cannot start from this page. ${NOTHING}`, next: needs === undefined ? "Go to the page it starts from and try again." : `It needs: ${needs} Go there and try again.`, classes };
    }
    case "part.input_missing":
      return { says: `It was not given everything it needs. ${NOTHING}`, next: "Fill in what is marked required and try again.", classes };
    case "part.input_unknown":
      return { says: `It was given a value it does not take. ${NOTHING}`, next: "Open its details to see what it needs, then try again.", classes };
    case "part.act_not_allowed":
      return { says: `It would ${does === "" ? "change something on the site" : does}, which needs your permission first. ${NOTHING}`, next: "Allow it this once, or leave it.", ask: "allow", classes };
    case "part.confirm_repeat":
      return { says: `It would do its acts again${does === "" ? "" : `: ${does}`}. ${NOTHING}`, next: "Go ahead only if you want that.", ask: "repeat", classes };
    case "part.calls_not_available":
      return { says: `A smaller subflow it uses is no longer saved. ${NOTHING}`, next: "Ask about it, and FluxIQ can help put it right.", classes };
    case "part.repeat_refused":
      return { says: `It would repeat something that cannot safely be done twice. ${NOTHING}`, next: "Check the site yourself first. Ask about it if you are unsure.", classes };
    case "parts.unavailable":
      return { says: `The library cannot be read right now. ${NOTHING}`, next: "Try again in a moment.", classes };
    case "part.not_found":
      return { says: `That subflow is no longer saved. ${NOTHING}`, next: "Go back to the library to see what is saved.", classes };
    case "parts.run_id_refused":
      return { says: `That run could not be started. ${NOTHING}`, next: "Try again.", classes };
  }
}
