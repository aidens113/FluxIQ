// What the model is told `core.full_page` does, and how page deliveries read (D3, D5, D6).
//
// Its own file so the tool descriptions can be reviewed together (t235). It is
// in the tool list, which sits in the request's head and never changes mid-run,
// so how a delivery reads is said here once rather than in every result. Held
// to the loop's 2,000 characters (`../evidence-loop-decision.ts`). Generic
// words only: no site, product or task (`scripts/check/model-text.mjs`
// downstream).

export const AUTOMATION_STUDIO_LLM_FULL_PAGE_DESCRIPTION =
  "The whole page the work is on, as it stands now. You never need to ask what a page looks like: every result that ran on a page carries it, whole the first time this run meets that page, and after that only what changed on it since it was last shown (since names that delivery's call; unchanged true when nothing did). "
  + "In changes, a line after \"- \" left the page, after \"+ \" arrived, and after \"~ \" now reads as shown; each group follows the unchanged line before it. A copy that replacedBy names a later call is out of date: that call carries the page now. The pages shown at once stay within a page budget: a copy marked droppedAt was let go for newer pages, and that page comes whole again when the work returns to it. "
  + "Call it with no part to capture the page again whole, including hidden elements and their attributes, which no other result shows; later changes are told against this capture. "
  + "A delivery longer than the page budget is sent in parts and says how many lines are left: call it with part set to a number for that part of the current page's latest delivery in parts, without capturing again. "
  + "It reads only: it changes nothing on the page and is never a step of the Flow.";
